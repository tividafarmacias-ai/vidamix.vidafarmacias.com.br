import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { compareImages } from './lib/catalog-image-sync.mjs';
import { resolveProductImage } from '../src/modules/products/product-images.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fingerprint = (value) => hash(JSON.stringify(value));

async function inventory(imagesRoot) {
  const result = [];
  for (const entry of await fs.readdir(path.join(imagesRoot, 'imagens'), { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.includes('.part-')) continue;
    const file = `imagens/${entry.name}`;
    const stat = await fs.stat(path.join(imagesRoot, file));
    result.push({ arquivo: file, bytes: stat.size, mtime_ms: stat.mtimeMs });
  }
  return result.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('Uso: node scripts/sync-image-manifest.mjs [--apply]');
  const imagesRoot = path.join(root, 'imagens-produtos');
  const manifestFile = path.join(imagesRoot, 'manifesto-imagens.json');
  const databaseFile = path.join(root, 'catalogo-crud/data/catalogo.sqlite');
  const originalText = await fs.readFile(manifestFile, 'utf8');
  const originalManifest = JSON.parse(originalText);
  const merged = { downloads: [...(originalManifest.downloads || [])], produtos: [...(originalManifest.produtos || [])] };
  for (const relative of ['imagens-produtos/manifesto-ultimo-mes.json', 'comparacao-catalogo/manifesto-catalogo-base.json']) {
    try {
      const content = JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
      merged.downloads.push(...(content.downloads || []));
      merged.produtos.push(...(content.produtos || []));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  let rows;
  try { rows = database.prepare('SELECT * FROM products ORDER BY id').all(); }
  finally { database.close(); }
  let reference = [];
  try {
    const data = JSON.parse(await fs.readFile(path.join(root, 'catalogo base.json'), 'utf8'));
    reference = Array.isArray(data) ? data : data.produtos || [];
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const referenceById = new Map(reference.map((row) => [row.id, row]));
  const products = rows.map((row) => {
    const source = referenceById.get(row.id);
    return { ...row, imagem_url_exibicao: source && (source.imagem_url || null) === (row.imagem_url || null) ? source.imagem_url_exibicao : null };
  });
  const files = await inventory(imagesRoot);
  console.log(`Conferindo ${rows.length} produtos e ${files.length} arquivos...`);
  const plan = await compareImages({ products, imagesRoot, manifest: merged, databaseProducts: rows,
    onScanProgress: ({ completed, total }) => {
      if (completed % 500 === 0 || completed === total) console.log(`Imagens verificadas: ${completed}/${total}`);
    },
  });
  if (fingerprint(files) !== fingerprint(await inventory(imagesRoot))) throw new Error('As imagens mudaram durante a análise. Reexecute.');
  const invalid = new Set(plan.invalidLocalFiles.map((entry) => entry.file));
  const available = new Map(files.filter((file) => !invalid.has(file.arquivo)).map((file) => [file.arquivo, file]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const entries = plan.products.map((entry) => {
    const current = rowById.get(entry.produto_id);
    const existing = resolveProductImage(imagesRoot, current.imagem_arquivo);
    // Preserve manual uploads and existing links that have no remote URL.
    const file = available.has(existing) && (current.imagem_status === 'manual' || !entry.url_normalizada) ? existing : entry.arquivo;
    return { ...entry, arquivo: file || null, status: file ? 'existente' : entry.status,
      bytes: file ? available.get(file).bytes : 0,
      origem_vinculo: file === existing && current.imagem_status === 'manual' ? 'manual' : 'url_ou_manifesto',
    };
  });
  const idsByFile = new Map();
  for (const entry of entries) {
    if (!entry.arquivo) continue;
    if (!idsByFile.has(entry.arquivo)) idsByFile.set(entry.arquivo, []);
    idsByFile.get(entry.arquivo).push(entry.produto_id);
  }
  const changes = entries.flatMap((entry) => {
    const previous = rowById.get(entry.produto_id);
    const status = entry.arquivo ? (entry.origem_vinculo === 'manual' ? 'manual' : 'existente') : entry.status === 'sem_imagem' ? 'sem_imagem' : 'erro';
    return previous.imagem_arquivo === entry.arquivo && previous.imagem_status === status ? [] : [{ id: entry.produto_id, antes: { arquivo: previous.imagem_arquivo, status: previous.imagem_status }, arquivo: entry.arquivo, status }];
  });
  const summary = {
    gerado_em: new Date().toISOString(), arquivo_origem: databaseFile,
    total_produtos: entries.length, produtos_com_imagem: entries.filter((entry) => entry.arquivo).length,
    produtos_sem_imagem_local: entries.filter((entry) => !entry.arquivo).length,
    arquivos_locais: files.length, arquivos_validos: available.size,
    arquivos_invalidos: invalid.size, arquivos_vinculados: idsByFile.size,
    arquivos_sem_produto: files.filter((file) => !idsByFile.has(file.arquivo)).length,
    vinculos_sqlite_a_corrigir: changes.length,
  };
  const manifest = {
    resumo: summary,
    produtos: entries,
    downloads: plan.images.map(({ candidates, ...image }) => image),
    arquivos: files.map((file) => ({ ...file, status: invalid.has(file.arquivo) ? 'invalido' : 'existente', produto_ids: idsByFile.get(file.arquivo) || [] })),
    arquivos_invalidos: plan.invalidLocalFiles,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) { console.log('Simulação concluída. Use --apply para sincronizar.'); return; }
  if (hash(await fs.readFile(manifestFile, 'utf8')) !== hash(originalText)) throw new Error('O manifesto mudou durante a análise. Reexecute.');
  const backupDir = path.join(root, 'backups', `sync-imagens-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, 'manifesto-imagens.json'), originalText);
  const reader = new DatabaseSync(databaseFile, { readOnly: true });
  try { await backup(reader, path.join(backupDir, 'catalogo.sqlite')); }
  finally { reader.close(); }
  const temporary = `${manifestFile}.part-${randomUUID()}`;
  await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const live = new DatabaseSync(databaseFile);
  let published = false;
  let transaction = false;
  try {
    live.exec('PRAGMA busy_timeout=10000; BEGIN IMMEDIATE');
    transaction = true;
    if (fingerprint(live.prepare('SELECT * FROM products ORDER BY id').all()) !== fingerprint(rows)) throw new Error('O catálogo mudou durante a análise. Reexecute.');
    const update = live.prepare('UPDATE products SET imagem_arquivo=?, imagem_status=? WHERE id=?');
    for (const change of changes) update.run(change.arquivo, change.status, change.id);
    const after = live.prepare('SELECT * FROM products ORDER BY id').all();
    const byId = new Map(entries.map((entry) => [entry.produto_id, entry]));
    for (const row of after) {
      if (row.imagem_arquivo !== byId.get(row.id).arquivo) throw new Error(`Vínculo divergente: ${row.id}`);
      const previous = rowById.get(row.id);
      for (const key of Object.keys(previous)) {
        if (!['imagem_arquivo', 'imagem_status'].includes(key) && row[key] !== previous[key]) throw new Error(`Campo alterado indevidamente: ${key}`);
      }
    }
    if (live.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Referências inválidas no banco.');
    await fs.rename(temporary, manifestFile);
    published = true;
    live.exec('COMMIT');
    transaction = false;
  } catch (error) {
    if (transaction) live.exec('ROLLBACK');
    if (published) {
      await fs.writeFile(temporary, originalText, 'utf8');
      await fs.rename(temporary, manifestFile);
    }
    throw error;
  } finally {
    live.close();
    await fs.rm(temporary, { force: true });
  }
  await fs.writeFile(path.join(backupDir, 'relatorio.json'), JSON.stringify({ ...summary, alteracoes_sqlite: changes }, null, 2));
  console.log(`Sincronização concluída. Backup: ${backupDir}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
