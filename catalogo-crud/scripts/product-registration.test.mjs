import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { initializeSchema } from '../src/database/catalog-database.mjs';
import { createApplication } from '../src/app.mjs';
import { createProductService } from '../src/modules/products/product-service.mjs';
import { loadConfig } from '../src/config.mjs';
import { adminAuthFixture } from './fixtures/auth.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH3sAAAAASUVORK5CYII=', 'base64');
const database = new DatabaseSync(':memory:');
const servers = [];
let directory, origin, service;
async function start(authService) {
  const config = loadConfig({ IMAGES_ROOT: directory, CATALOG_STORAGE_ROOT: directory });
  const server = createServer(createApplication({ config, database, authService }));
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function json(route, body, method = 'POST', base = origin) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function upload(route, buffer = png) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: 'image/png' }), 'caixinha.png');
  const response = await fetch(origin + route, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vidamix-registration-'));
  initializeSchema(database);
  const insert = database.prepare(`INSERT INTO products (nome, fabricante, categoria_produtos, grupo, generico, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'ativo', '', '')`);
  insert.run('Importado A', 'Vini Lady', 'Medicamento', 'Tarjado', 0);
  insert.run('Importado B', 'ViniLady', 'Medicamentos', 'Tarjado', 1);
  insert.run('Importado C', 'Vini Lady', ' Medicamento ', 'Não Medicado', 0);
  origin = await start(adminAuthFixture());
  service = createProductService({ database, imagesDirectory: directory });
});
after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); })));
  database.close();
  if (directory && path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('vidamix-registration-')) {
    await rm(directory, { recursive: true, force: true });
  }
});

test('manufacturer registry consolidates legacy variants, rejects duplicates and persists renames', async () => {
  assert.deepEqual(service.listManufacturers().map((item) => ({ ...item })), [{ id: 1, nome: 'Vini Lady' }]);
  assert.equal(service.getProduct(2).fabricante, 'Vini Lady');
  for (const nome of ['VINILADY', 'Vini  Lady', 'Víni Lady']) {
    const duplicate = await json('/api/manufacturers', { nome });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error, /Vini Lady/);
  }
  assert.equal((await json('/api/products', { nome: 'Exemplo', fabricante: 'Não cadastrado' })).status, 400);
  const manufacturer = await json('/api/manufacturers', { nome: 'Nova Indústria' });
  assert.equal(manufacturer.status, 201);
  const created = await json('/api/products', { nome: 'Produto de teste', fabricante: 'NOVAINDUSTRIA', grupo: 'NÃO MEDICAMENTO' });
  assert.equal(created.body.fabricante, 'Nova Indústria');
  const renamed = await json('/api/manufacturers/1', { nome: 'ViniLady' }, 'PUT');
  assert.equal(renamed.status, 200);
  for (const id of [1, 2, 3]) assert.equal(database.prepare('SELECT fabricante FROM products WHERE id = ?').get(id).fabricante, 'ViniLady');
  const restarted = createProductService({ database, imagesDirectory: directory });
  assert.equal(restarted.listManufacturers().length, 2);
  assert.equal(restarted.getProduct(1).fabricante, 'ViniLady');
  assert.equal((await json('/api/manufacturers/1', { nome: 'NovaIndustria' }, 'PUT')).status, 409);
});

test('medicine category is unique and both old spellings remain searchable through the same filter', async () => {
  const categories = service.listCategories().filter((item) => /medicamento/i.test(item.nome));
  assert.deepEqual(categories.map((item) => ({ ...item })), [{ nome: 'Medicamento', total: 3 }]);
  for (const category of ['Medicamento', 'Medicamentos']) {
    const list = service.listProducts(new URLSearchParams({ categoria: category }));
    assert.equal(list.pagination.total, 3);
    assert.ok(list.items.every((item) => item.categoria_produtos === 'Medicamento'));
  }
  const saved = await json('/api/products/3', { categoria_produtos: 'Medicamentos' }, 'PUT');
  assert.equal(saved.body.categoria_produtos, 'Medicamento');
});

test('only supported groups are saved and the generic flag follows the selected group', async () => {
  assert.equal((await json('/api/products', { nome: 'Inválido', grupo: 'Med' })).status, 400);
  assert.equal(service.getProduct(3).grupo, 'NÃO MEDICAMENTO');
  const product = service.createProduct({ nome: 'Medicamento teste', grupo: 'Genérico', generico: false });
  assert.equal(product.grupo, 'GENÉRICO');
  assert.equal(product.generico, true);
  const changed = service.updateProduct(product.id, { grupo: 'MIP', generico: true });
  assert.equal(changed.generico, false);
  assert.equal(changed.grupo, 'MIP');
});

test('bundled boxes work without setup for existing products, detail, barcode and image filters', async () => {
  for (const [id, filename] of [[1, 'padrao-tarjado.png'], [2, 'padrao-generico.png']]) {
    const product = service.getProduct(id);
    assert.equal(product.possui_imagem_local, true);
    assert.equal(product.imagem_padrao, true);
    assert.ok(product.imagem_local_url.startsWith(`/assets/imagens/${filename}?v=`));
    const expected = await readFile(new URL(`../assets/imagens/${filename}`, import.meta.url));
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(origin + product.imagem_local_url, { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(Number(response.headers.get('content-length')), expected.length);
      if (method === 'GET') assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    }
    const detail = await (await fetch(origin + `/api/products/${id}`)).json();
    assert.equal(detail.imagem_local_url, product.imagem_local_url);
    service.updateProduct(id, { ean: String(7896007548400 + id) });
    assert.equal(service.getProductByEan(String(7896007548400 + id)).imagem_local_url, product.imagem_local_url);
  }
  const visible = service.listProducts(new URLSearchParams({ imagem: 'com' })).items;
  assert.deepEqual(visible.map((item) => item.id).sort(), [1, 2]);
  assert.equal(service.getSummary().com_imagem, 2);
  assert.ok(service.listProducts(new URLSearchParams({ imagem: 'sem' })).items.every((item) => ![1, 2].includes(item.id)));
});

test('plural and accented legacy groups use boxes even with an individual image reference', () => {
  const insert = database.prepare(`INSERT INTO products (nome, grupo, generico, imagem_arquivo, imagem_status, status, created_at, updated_at)
    VALUES ('Grupo legado', ?, 0, 'imagens/foto-antiga.png', 'sem_imagem', 'ativo', '', '')`);
  for (const group of ['genericos', 'genéricos', ' GENÉRICOS ', 'tarjados', ' TARJADO ']) {
    const id = Number(insert.run(group).lastInsertRowid);
    try {
      const product = service.getProduct(id);
      assert.equal(product.imagem_padrao, true);
      assert.match(product.imagem_local_url, group.trim().toLowerCase().startsWith('tarjad') ? /padrao-tarjado/ : /padrao-generico/);
      assert.equal(product.imagem_arquivo, 'imagens/foto-antiga.png');
      assert.ok(service.listProducts(new URLSearchParams({ imagem: 'com' })).items.some((item) => item.id === id));
      assert.ok(!service.listProducts(new URLSearchParams({ imagem: 'sem' })).items.some((item) => item.id === id));
    } finally { service.deleteProduct(id); }
  }
});

test('configured boxes follow the group, refresh without restart and take priority over product photos', async () => {
  assert.equal(service.getProduct(1).possui_imagem_local, true);
  assert.equal((await upload('/api/product-groups/MIP/image')).status, 400);
  assert.equal((await upload('/api/product-groups/TARJADO/image', Buffer.from('invalid'))).status, 400);
  const tarjado = await upload('/api/product-groups/TARJADO/image');
  const generic = await upload('/api/product-groups/GEN%C3%89RICO/image');
  assert.equal(tarjado.status, 200);
  assert.equal(generic.status, 200);
  const branded = service.getProduct(1);
  assert.equal(branded.imagem_padrao, true);
  assert.equal(branded.imagem_arquivo, null, 'Default must not overwrite the product photo reference');
  assert.equal(branded.imagem_local_url, tarjado.body.imagem_local_url);
  assert.equal(service.getProduct(2).imagem_local_url, generic.body.imagem_local_url, 'Legacy generic flag selects the generic box');
  assert.equal((await fetch(origin + branded.imagem_local_url)).status, 200);
  const visible = service.listProducts(new URLSearchParams({ imagem: 'com' })).items.map((item) => item.id);
  assert.ok(visible.includes(1) && visible.includes(2));
  const missing = service.listProducts(new URLSearchParams({ imagem: 'sem' })).items.map((item) => item.id);
  assert.ok(!missing.includes(1) && !missing.includes(2));
  assert.equal(service.getSummary().com_imagem, visible.length);
  const switched = service.updateProduct(1, { grupo: 'GENÉRICO' });
  assert.equal(switched.imagem_local_url, generic.body.imagem_local_url);
  const withoutDefault = service.updateProduct(1, { grupo: 'NÃO MEDICAMENTO' });
  assert.equal(withoutDefault.imagem_local_url, null);
  service.updateProduct(1, { grupo: 'TARJADO', ean: '07896007548400' });
  const ownPhoto = await upload('/api/products/1/image');
  assert.match(ownPhoto.body.imagem_arquivo, /upload-ean-07896007548400-/);
  assert.equal(ownPhoto.body.imagem_padrao, true);
  assert.equal(ownPhoto.body.imagem_local_url, tarjado.body.imagem_local_url);
  const replaced = await upload('/api/product-groups/TARJADO/image');
  assert.notEqual(replaced.body.imagem_local_url, tarjado.body.imagem_local_url);
  assert.equal(service.getProduct(1).imagem_local_url, replaced.body.imagem_local_url);
  const reused = service.updateProduct(1, { imagem_arquivo: '' });
  assert.equal(reused.imagem_local_url, replaced.body.imagem_local_url);
});

test('customers can view default images but cannot manage manufacturers or shared boxes', async () => {
  const auth = { getSession: async () => ({ user: { role: 'cliente' } }), assertMutation() { throw new Error('Must deny before mutation'); } };
  const customerOrigin = await start(auth);
  for (const route of ['/api/manufacturers', '/api/product-groups']) {
    assert.equal((await fetch(customerOrigin + route)).status, 403);
    assert.equal((await json(route, { nome: 'Teste' }, 'POST', customerOrigin)).status, 403);
  }
  assert.equal((await json('/api/manufacturers/1', { nome: 'Teste' }, 'PUT', customerOrigin)).status, 403);
  assert.equal((await json('/api/product-groups/TARJADO/image', {}, 'POST', customerOrigin)).status, 403);
  assert.equal((await fetch(customerOrigin + service.getProduct(1).imagem_local_url)).status, 200);
});
