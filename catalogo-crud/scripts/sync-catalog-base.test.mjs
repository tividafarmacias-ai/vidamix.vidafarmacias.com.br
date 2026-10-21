import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initializeSchema } from '../src/database/catalog-database.mjs';
import { syncCatalog, fingerprint } from './sync-catalog-base.mjs';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  initializeSchema(db);
  db.exec(`
    INSERT INTO products (id,nome,created_at,updated_at) VALUES
      (1,'Anterior','2026-01-01','2026-01-01'), (2,'Fora do catálogo','2026-01-01','2026-01-01');
    INSERT INTO revista_campaigns VALUES (1,'Campanha','2026-10','hash','2026-01-01');
    INSERT INTO revista_items VALUES (1,1,1,'123','Oferta',100);
    CREATE TABLE auth_fixture (id INTEGER PRIMARY KEY, value TEXT);
    INSERT INTO auth_fixture VALUES (1,'preservar');
  `);
  return db;
}
const product = (id) => ({
  id, nome: `Produto ${id}`, ean: 'EAN-compartilhado',
  status: 'ativo', generico: true, produto_destaque: false,
  created_at: '2026-01-01', updated_at: '2026-10-20',
});
const rows = (db) => db.prepare('SELECT * FROM products ORDER BY id').all();

test('upserts by ID, reconciles extras, preserves other tables and is idempotent', (t) => {
  const db = fixture(t);
  const products = [product(1), product(3)];
  const imageById = new Map([[1, { file: 'imagens/local.webp' }], [3, { file: null, status: 'erro' }]]);
  const first = syncCatalog(db, { products, imageById, expectedFingerprint: fingerprint(rows(db)) });
  assert.equal(first.inseridos, 1);
  assert.equal(first.atualizados, 1);
  assert.equal(first.removidos, 1);
  assert.deepEqual(rows(db).map((row) => row.id), [1, 3]);
  assert.equal(db.prepare('SELECT product_id FROM revista_items').get().product_id, 1);
  assert.equal(db.prepare('SELECT value FROM auth_fixture').get().value, 'preservar');
  assert.equal(rows(db)[0].imagem_arquivo, 'imagens/local.webp');
  assert.equal(rows(db)[1].imagem_status, 'erro');
  const second = syncCatalog(db, { products, imageById });
  assert.equal(second.inseridos + second.atualizados + second.removidos, 0);
  assert.equal(second.inalterados, 2);
});

test('removal with a campaign reference aborts without changing products or campaign', (t) => {
  const db = fixture(t);
  const before = rows(db);
  assert.throws(() => syncCatalog(db, { products: [product(3)], imageById: new Map() }), /referências/);
  assert.deepEqual(rows(db), before);
  assert.equal(db.prepare('SELECT product_id FROM revista_items').get().product_id, 1);
});

test('concurrent product change after backup aborts the synchronization', (t) => {
  const db = fixture(t);
  const expectedFingerprint = fingerprint(rows(db));
  db.prepare('UPDATE products SET nome=? WHERE id=1').run('Edição concorrente');
  assert.throws(() => syncCatalog(db, { products: [product(1)], imageById: new Map(), expectedFingerprint }), /mudou depois do backup/);
  assert.equal(rows(db)[0].nome, 'Edição concorrente');
  assert.equal(rows(db).length, 2);
});

test('invalid or duplicate IDs are rejected before touching the database', (t) => {
  const db = fixture(t);
  const before = rows(db);
  for (const products of [[], [product(1), product(1)], [product(-1)]]) {
    assert.throws(() => syncCatalog(db, { products, imageById: new Map() }));
    assert.deepEqual(rows(db), before);
  }
});
