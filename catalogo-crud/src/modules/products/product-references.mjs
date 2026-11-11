import { badRequest, HttpError } from '../../http/errors.mjs';

export const productGroups = Object.freeze(['NÃO MEDICAMENTO', 'MIP', 'TARJADO', 'GENÉRICO']);

export function referenceKey(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeGroup(value) {
  const key = referenceKey(value);
  if (key === 'genericos') return 'GENÉRICO';
  if (key === 'tarjados') return 'TARJADO';
  if (['naomedicamento', 'naomedicado'].includes(key)) return 'NÃO MEDICAMENTO';
  return productGroups.find((group) => referenceKey(group) === key) || null;
}

export function normalizeCategory(value) {
  const name = String(value ?? '').trim();
  return ['medicamento', 'medicamentos'].includes(referenceKey(name)) ? 'Medicamento' : name || null;
}

// Used consistently by category lists, counts and filters, including legacy rows.
export const categoryExpression = `CASE WHEN lower(trim(categoria_produtos)) IN ('medicamento', 'medicamentos')
  THEN 'Medicamento' ELSE nullif(trim(categoria_produtos), '') END`;

export function createManufacturerRegistry(database) {
  let seeded = false;
  // Seed existing names without rewriting imported product records. The most
  // frequently used spelling wins; spacing, case and accents share one key.
  function seed() {
    if (seeded) return;
    const names = database.prepare(`SELECT fabricante AS nome, COUNT(*) AS total FROM products
    WHERE trim(coalesce(fabricante, '')) != '' GROUP BY fabricante ORDER BY total DESC, fabricante`).all();
    const insert = database.prepare('INSERT OR IGNORE INTO manufacturers (nome, name_key) VALUES (?, ?)');
    database.exec('SAVEPOINT manufacturer_seed');
    try {
      for (const { nome } of names) {
        const key = referenceKey(nome);
        if (key) insert.run(nome.trim().replace(/\s+/g, ' '), key);
      }
      database.exec('RELEASE manufacturer_seed');
      seeded = true;
    } catch (error) {
      database.exec('ROLLBACK TO manufacturer_seed; RELEASE manufacturer_seed');
      throw error;
    }
  }

  function find(name) {
    seed();
    return database.prepare('SELECT id, nome FROM manufacturers WHERE name_key = ?').get(referenceKey(name));
  }

  function validate(name, exceptId = null) {
    const nome = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!nome || nome.length > 255 || !referenceKey(nome)) throw badRequest('Informe um fabricante com até 255 caracteres.');
    const existing = find(nome);
    if (existing && existing.id !== exceptId) throw new HttpError(409, `Este fabricante já está cadastrado como “${existing.nome}”.`);
    return nome;
  }

  return {
    find,
    list() {
      seed();
      return database.prepare('SELECT id, nome FROM manufacturers').all().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
    create(payload) {
      const nome = validate(payload?.nome);
      const result = database.prepare('INSERT INTO manufacturers (nome, name_key) VALUES (?, ?)').run(nome, referenceKey(nome));
      return { id: Number(result.lastInsertRowid), nome };
    },
    rename(id, payload) {
      seed();
      const existing = database.prepare('SELECT * FROM manufacturers WHERE id = ?').get(id);
      if (!existing) return null;
      const nome = validate(payload?.nome, id);
      const variants = database.prepare('SELECT DISTINCT fabricante FROM products WHERE fabricante IS NOT NULL').all()
        .filter((row) => referenceKey(row.fabricante) === existing.name_key);
      database.exec('SAVEPOINT manufacturer_rename');
      try {
        database.prepare('UPDATE manufacturers SET nome = ?, name_key = ? WHERE id = ?').run(nome, referenceKey(nome), id);
        const update = database.prepare('UPDATE products SET fabricante = ?, updated_at = ? WHERE fabricante = ?');
        const timestamp = new Date().toISOString();
        for (const row of variants) update.run(nome, timestamp, row.fabricante);
        database.exec('RELEASE manufacturer_rename');
      } catch (error) {
        database.exec('ROLLBACK TO manufacturer_rename; RELEASE manufacturer_rename');
        throw error;
      }
      return { id, nome };
    },
  };
}
