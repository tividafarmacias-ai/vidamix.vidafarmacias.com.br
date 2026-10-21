import fs from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { makeImageFileName, normalizeImageUrl } from './lib/catalog-image-sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fields = [
  'id', 'nome', 'subtitulo', 'caracteres', 'grupo', 'principio_ativo', 'ms', 'fabricante',
  'categoria_id', 'categoria_produtos', 'categoria_nome', 'frases_encarte', 'status',
  'data_vigencia_inicio', 'data_vigencia_fim', 'generico', 'produto_destaque', 'ean',
  'direcao_imagem', 'imagem_url', 'imagem_arquivo', 'imagem_status', 'created_at', 'updated_at',
];
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
export const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeProducts(products, imageById) {
  if (!Array.isArray(products) || !products.length) throw new Error('Catálogo vazio ou inválido.');
  const ids = new Set();
  return products.map((product) => {
    if (!Number.isSafeInteger(product.id) || product.id < 1 || ids.has(product.id)) throw new Error('ID inválido ou duplicado no catálogo.');
    ids.add(product.id);
    if (typeof product.nome !== 'string' || !product.nome.trim()) throw new Error(`Produto ${product.id} sem nome.`);
    if (!product.created_at || !product.updated_at) throw new Error(`Produto ${product.id} sem datas de origem.`);
    const image = imageById.get(product.id);
    const row = Object.fromEntries(fields.map((field) => [field, product[field] ?? null]));
    row.generico = product.generico === true || product.generico === 1 ? 1 : 0;
    row.produto_destaque = product.produto_destaque === true || product.produto_destaque === 1 ? 1 : 0;
    row.status = product.status || 'ativo';
    row.imagem_arquivo = image?.file || null;
    row.imagem_status = image?.file ? 'existente' : image?.status || 'sem_imagem';
    return row;
  }).sort((a, b) => a.id - b.id);
}

function snapshotOtherTables(database) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'products' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => {
    const rows = database.prepare(`SELECT * FROM ${identifier(name)}`).all();
    return [name, fingerprint(rows.map((row) => JSON.stringify(row)).sort())];
  }));
}

/** Transactional synchronization: does not fetch or modify any image files. */
export function syncCatalog(database, { products, imageById, expectedFingerprint }) {
  const desired = normalizeProducts(products, imageById);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000; BEGIN IMMEDIATE');
  try {
    const before = database.prepare('SELECT * FROM products ORDER BY id').all();
    if (expectedFingerprint && fingerprint(before) !== expectedFingerprint) throw new Error('O catálogo mudou depois do backup. Reexecute para obter um novo backup.');
    const protectedTables = snapshotOtherTables(database);
    const original = new Map(before.map((row) => [row.id, row]));
    const ids = new Set(desired.map((row) => row.id));
    const removed = before.filter((row) => !ids.has(row.id));
    // Never silently sever a campaign or another table's references.
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const { name } of tables) {
      for (const relation of database.prepare(`PRAGMA foreign_key_list(${identifier(name)})`).all()) {
        if (relation.table !== 'products') continue;
        const count = database.prepare(`SELECT COUNT(*) n FROM ${identifier(name)} WHERE ${identifier(relation.from)} = ?`);
        for (const row of removed) {
          if (count.get(row[relation.to || 'id']).n) throw new Error(`O produto ${row.id} tem referências em ${name}; sincronização cancelada para preservá-las.`);
        }
      }
    }
    const upsert = database.prepare(`INSERT INTO products (${fields.map(identifier).join(',')})
      VALUES (${fields.map(() => '?').join(',')})
      ON CONFLICT(id) DO UPDATE SET ${fields.filter((field) => field !== 'id').map((field) => `${identifier(field)}=excluded.${identifier(field)}`).join(',')}`);
    const inserted = [];
    const updated = [];
    let unchanged = 0;
    for (const row of desired) {
      const previous = original.get(row.id);
      const changed = fields.filter((field) => previous?.[field] !== row[field]);
      if (previous && !changed.length) { unchanged++; continue; }
      upsert.run(...fields.map((field) => row[field]));
      if (previous) updated.push({ id: row.id, campos: changed });
      else inserted.push(row.id);
    }
    const remove = database.prepare('DELETE FROM products WHERE id = ?');
    for (const row of removed) remove.run(row.id);
    const actual = database.prepare('SELECT * FROM products ORDER BY id').all();
    if (actual.length !== desired.length || actual.some((row, index) => fields.some((field) => row[field] !== desired[index][field]))) {
      throw new Error('Verificação dos produtos após a sincronização falhou.');
    }
    if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Há referências inválidas no banco.');
    const integrity = database.prepare('PRAGMA quick_check').all();
    if (integrity.some((row) => Object.values(row)[0] !== 'ok')) throw new Error('Verificação de integridade falhou.');
    if (JSON.stringify(protectedTables) !== JSON.stringify(snapshotOtherTables(database))) throw new Error('Uma tabela fora de products foi alterada.');
    const result = {
      total_antes: before.length, total_depois: actual.length,
      inseridos: inserted.length, atualizados: updated.length, inalterados: unchanged,
      removidos: removed.length, com_imagem_local: actual.filter((row) => row.imagem_arquivo).length,
      sem_imagem_local: actual.filter((row) => !row.imagem_arquivo).length,
      ids_inseridos: inserted, alteracoes: updated,
      produtos_removidos: removed.map(({ id, nome, ean }) => ({ id, nome, ean })),
      outras_tabelas_preservadas: Object.keys(protectedTables), integridade: 'ok',
    };
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

async function resolveImages(products, current, manifests, imagesRoot) {
  const links = new Map();
  const safePath = (file) => typeof file === 'string' && /^imagens\/[^/\\:\0]+$/.test(file) && !path.posix.basename(file).startsWith('.');
  function add(url, file) {
    try {
      const normalized = normalizeImageUrl(url);
      if (!normalized || !safePath(file)) return;
      if (!links.has(normalized)) links.set(normalized, []);
      links.get(normalized).push(file);
    } catch { /* Invalid historical URL is not an image match. */ }
  }
  for (const row of current) add(row.imagem_url, row.imagem_arquivo);
  for (const manifest of manifests) {
    for (const row of manifest.produtos || []) add(row.url_normalizada || row.imagem_url, row.arquivo);
    for (const row of manifest.downloads || []) add(row.url, row.file || (row.fileName ? `imagens/${row.fileName}` : null));
  }
  const cache = new Map();
  const result = new Map();
  for (const product of products) {
    let url;
    try { url = normalizeImageUrl(product.imagem_url?.trim() || product.imagem_url_exibicao); }
    catch { result.set(product.id, { file: null, status: 'url_invalida' }); continue; }
    if (!url) { result.set(product.id, { file: null, status: 'sem_imagem' }); continue; }
    if (!cache.has(url)) {
      const candidates = [...(links.get(url) || []), `imagens/${makeImageFileName(url)}`];
      let selected = null;
      for (const candidate of candidates) {
        if (!safePath(candidate)) continue;
        const stem = candidate.slice(0, -path.posix.extname(candidate).length);
        for (const file of [...new Set([`${stem}.webp`, `${stem}_resultado.webp`, candidate, `${stem}.jpg`, `${stem}.png`, `${stem}.avif`])]) {
          try {
            const info = lstatSync(path.join(imagesRoot, file));
            if (info.isFile() && info.size > 0) { selected = file; break; }
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (selected) break;
      }
      cache.set(url, { file: selected, status: selected ? 'existente' : 'erro' });
    }
    result.set(product.id, cache.get(url));
  }
  return result;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('Uso: node scripts/sync-catalog-base.mjs [--apply]');
  const catalogFile = path.join(root, 'catalogo base.json');
  const databaseFile = path.join(root, 'catalogo-crud/data/catalogo.sqlite');
  const source = await fs.readFile(catalogFile, 'utf8');
  const parsed = JSON.parse(source.replace(/^\uFEFF/, ''));
  const products = Array.isArray(parsed) ? parsed : parsed.produtos || parsed.data;
  normalizeProducts(products, new Map());
  const backupDir = path.join(root, 'backups', `sync-catalogo-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, 'catalogo.sqlite');
  const connection = new DatabaseSync(databaseFile, { readOnly: true });
  try { await backup(connection, backupFile); }
  finally { connection.close(); }
  const original = new DatabaseSync(backupFile, { readOnly: true });
  let rows;
  try { rows = original.prepare('SELECT * FROM products ORDER BY id').all(); }
  finally { original.close(); }
  const manifests = [];
  for (const filename of ['comparacao-catalogo/manifesto-catalogo-base.json', 'imagens-produtos/manifesto-imagens.json']) {
    try { manifests.push(JSON.parse(await fs.readFile(path.join(root, filename), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const imageById = await resolveImages(products, rows, manifests, path.join(root, 'imagens-produtos'));
  // Rehearse against an independent copy; the original backup stays untouched.
  const rehearsal = path.join(backupDir, 'ensaio.sqlite');
  await fs.copyFile(backupFile, rehearsal);
  const trial = new DatabaseSync(rehearsal);
  let result;
  try { result = syncCatalog(trial, { products, imageById, expectedFingerprint: fingerprint(rows) }); }
  finally { trial.close(); }
  const metadata = {
    gerado_em: new Date().toISOString(), origem: catalogFile,
    sha256_catalogo: createHash('sha256').update(source).digest('hex'),
    backup: backupFile, banco: databaseFile, aplicado: apply,
  };
  if (apply) {
    if (await fs.readFile(catalogFile, 'utf8') !== source) throw new Error('O JSON mudou durante a preparação. Reexecute.');
    const live = new DatabaseSync(databaseFile);
    try { result = syncCatalog(live, { products, imageById, expectedFingerprint: fingerprint(rows) }); }
    finally { live.close(); }
  }
  await fs.writeFile(path.join(backupDir, 'relatorio.json'), JSON.stringify({ ...metadata, ...result }, null, 2));
  console.log(JSON.stringify({
    ...metadata, total_antes: result.total_antes, total_depois: result.total_depois,
    inseridos: result.inseridos, atualizados: result.atualizados, inalterados: result.inalterados,
    removidos: result.removidos, com_imagem_local: result.com_imagem_local,
    sem_imagem_local: result.sem_imagem_local, integridade: result.integridade,
    outras_tabelas_preservadas: result.outras_tabelas_preservadas,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
