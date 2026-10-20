import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import ExcelJS from 'exceljs';
import { initializeSchema } from '../src/database/catalog-database.mjs';
import { createRevistaService, createRevistaTemplate, readRevistaWorkbook } from '../src/modules/revista/revista-service.mjs';
import { createApplication } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';

function databaseFixture(t) {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  initializeSchema(database);
  const insert = database.prepare('INSERT INTO products (id, nome, ean, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  insert.run(1, 'Produto de teste', '7891234567890', '2026-10-01', '2026-10-01');
  insert.run(2, 'Produto com zero inicial', '0012345678905', '2026-10-01', '2026-10-01');
  t.after(() => database.close());
  return { database, service: createRevistaService({ database }) };
}
async function file(rows, change = () => {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Revista');
  sheet.addRow(['EAN', 'PREÇO', 'VIGENCIA']);
  for (const row of rows) sheet.addRow(row);
  change(sheet, workbook);
  return { filename: 'revista.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

test('downloaded template has exact headers, text EAN/month columns and no sample products', async () => {
  const buffer = await createRevistaTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['EAN', 'PREÇO', 'VIGENCIA']);
  assert.equal(sheet.getCell('A2').numFmt, '@');
  assert.equal(sheet.getCell('C2').numFmt, '@');
  await assert.rejects(readRevistaWorkbook({ filename: 'modelo.xlsx', buffer }), /pelo menos um produto/);
  sheet.addRow(['7891234567890', 19.90, '10/2026']);
  const rows = await readRevistaWorkbook({ filename: 'modelo.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].priceCents, 1990);
});

test('reads Brazilian prices, numeric values, leading zero EANs and Excel month dates', async t => {
  const { service } = databaseFixture(t);
  const rows = await readRevistaWorkbook(await file([
    ['0012345678905', 'R$ 1.299,90', '10/2026'],
    [7891234567890, 9.99, new Date('2026-10-01T00:00:00Z')],
  ]));
  assert.equal(rows[0].ean, '0012345678905');
  assert.equal(rows[0].priceCents, 129990);
  assert.equal(rows[1].month, '10/2026');
  assert.equal(service.validate(rows).valid, true);
});

test('reports all missing EANs and creates the campaign only with matched products', async t => {
  const { service, database } = databaseFixture(t);
  const rows = await readRevistaWorkbook(await file([
    ['7891234567890', 19.9, '10/2026'], ['9999999999999', 1, '10/2026'], ['8888888888888', 2, '10/2026'],
  ]));
  const report = service.validate(rows);
  assert.equal(report.valid, true);
  assert.equal(report.items.length, 1);
  assert.deepEqual(report.missing, [{ line: 3, ean: '9999999999999' }, { line: 4, ean: '8888888888888' }]);
  const saved = service.create(rows);
  assert.equal(saved.skippedCount, 2);
  assert.equal(saved.campaign.items.length, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM revista_campaigns').get().count, 1);
  assert.equal(service.validate(rows.slice(1)).valid, false, 'cannot create an empty campaign');
  assert.ok(service.create(rows.slice(1)).report);
});

test('invalid rows, duplicates and other months are skipped while valid rows can be saved', async t => {
  const { service } = databaseFixture(t);
  const rows = await readRevistaWorkbook(await file([
    ['7891234567890', -10, '13/2026'],
    ['7891234567890', { formula: '1+1', result: 2 }, '10/2026'],
    ['0012345678905', 0, '11/2026'],
    ['invalid', 'abc', '2026-10'],
    ['7891234567890', 19.9, '10/2026'],
    ['7891234567890', 20, '10/2026'],
    ['0012345678905', 20, '11/2026'],
    ['0012345678905', 9.99, '10/2026'],
  ]));
  const report = service.validate(rows);
  assert.equal(report.valid, true);
  assert.equal(report.month, '10/2026');
  assert.deepEqual(report.items.map(item => item.line), [6, 9], 'invalid earlier occurrences do not reserve an EAN or a month');
  assert.equal(report.skippedCount, 6);
  assert.ok(report.errors.some(error => /repetido/.test(error.message)));
  assert.ok(report.errors.some(error => error.line === 8 && /diferente da campanha/.test(error.message)));
  assert.ok(report.errors.some(error => error.line === 2 && /preço/.test(error.message)));
  assert.ok(report.errors.some(error => error.line === 3 && /preço/.test(error.message)));
  const result = service.create(rows);
  assert.equal(result.skippedCount, 6);
  assert.deepEqual(result.campaign.items.map(item => item.priceCents), [1990, 999]);
});

test('hidden fractional cents are truncated without rounding and exact cent values are preserved', async () => {
  const prices = [37.056250000000006, 41.34375, 50.7325, 69.61500000000001,
    15.004, 28.149, 16.104, 16.104, 16.104, 86.468, 51.487500000000004,
    69.375, 86.68074999999999, 46.975699999999996, 26.205, 21.794999999999998,
    28.485, 28.485, 11.985, 11.985, 16.485, 16.485];
  const input = await file([...prices, 7.290000000000001, 103.35, 12.9].map(price => ['7891234567890', price, '10/2026']),
    sheet => { sheet.getColumn(2).numFmt = '0.00'; });
  const rows = await readRevistaWorkbook(input);
  assert.deepEqual(rows.slice(0, prices.length).map(row => row.priceCents),
    [3705, 4134, 5073, 6961, 1500, 2814, 1610, 1610, 1610, 8646, 5148,
      6937, 8668, 4697, 2620, 2179, 2848, 2848, 1198, 1198, 1648, 1648]);
  assert.ok(rows.every(row => !row.priceError));
  assert.deepEqual(rows.slice(prices.length).map(row => row.priceCents), [729, 10335, 1290]);
});

test('truncates numeric and Brazilian text prices while rejecting invalid or sub-cent prices', async () => {
  const prices = [0.29, 1.15, 9.999, 'R$ 1.299,9999', '37,05625', '0,019',
    0.0099, '0,0099', -1, 'abc', null, '1,2,3', 10000000, '10.000.000,00', '9.999.999,999'];
  const rows = await readRevistaWorkbook(await file(prices.map(price => ['7891234567890', price, '10/2026'])));
  assert.deepEqual(rows.map(row => row.priceCents),
    [29, 115, 999, 129999, 3705, 1, null, null, null, null, null, null, null, null, 999999999]);
});

test('skipped count counts rows once even when they are both missing and invalid; an empty campaign stays blocked', async t => {
  const { service } = databaseFixture(t);
  const rows = await readRevistaWorkbook(await file([
    ['7891234567890', null, '10/2026'], ['9999999999999', -1, '13/2026'],
  ]));
  const report = service.validate(rows);
  assert.equal(report.valid, false);
  assert.equal(report.items.length, 0);
  assert.equal(report.skippedCount, 2);
  assert.equal(report.missing.length, 1);
  assert.equal(report.errors.length, 3);
  assert.ok(service.create(rows).report);
  assert.equal(service.list().length, 0);
});

test('creates and retrieves monthly campaigns atomically; retries do not duplicate', async t => {
  const { service, database } = databaseFixture(t);
  const rows = await readRevistaWorkbook(await file([['7891234567890', 19.9, '10/2026'], ['0012345678905', 9.9, '10/2026']]));
  const { campaign } = service.create(rows, 'Outubro');
  assert.equal(campaign.name, 'Outubro');
  assert.equal(campaign.items.length, 2);
  assert.equal(campaign.items[0].priceCents, 1990);
  assert.equal(service.create(rows, 'Outra tentativa').existing, true);
  assert.equal(service.list().length, 1);
  assert.equal(service.list()[0].productCount, 2);
  assert.equal(createRevistaService({ database }).get(campaign.id).items.length, 2);
  database.prepare('DELETE FROM products WHERE id = 1').run();
  assert.equal(service.get(campaign.id).items[0].name, 'Produto de teste', 'campaign keeps imported snapshot');
  assert.equal(service.create(rows).skippedCount, 1, 'saving always rechecks catalogue');
});

test('active campaign follows Sao Paulo month boundaries and the latest import for that month', t => {
  const { service, database } = databaseFixture(t);
  const rows = month => [{ line: 2, ean: '7891234567890', priceCents: 1990, month }];
  assert.equal(service.active(new Date('2026-10-01T03:00:00Z')), null);
  const september = service.create(rows('09/2026'), 'Setembro').campaign;
  service.create(rows('10/2026'), 'Outubro anterior');
  const october = service.create([{ ...rows('10/2026')[0], priceCents: 3705 }], 'Outubro atual').campaign;
  service.create(rows('11/2026'), 'Novembro');
  assert.equal(service.active(new Date('2026-10-01T02:59:59Z')).id, september.id);
  assert.equal(service.active(new Date('2026-10-01T03:00:00Z')).id, october.id);
  const active = service.active(new Date('2026-11-01T02:59:59Z'));
  assert.equal(active.id, october.id);
  assert.equal(active.items[0].priceCents, 3705);
  assert.equal(active.items[0].available, false, 'items without images stay listed without artwork actions');
  database.prepare('DELETE FROM products WHERE id = 1').run();
  assert.equal(service.active(new Date('2026-10-19T12:00:00Z')).items[0].productId, null);
  assert.equal(service.active(new Date('2026-12-01T03:00:00Z')), null);
});

test('active offer API supplies saved prices and rejects stale campaigns and unavailable products', async t => {
  const { database, service } = databaseFixture(t);
  database.prepare("UPDATE products SET imagem_arquivo = 'imagens/test.webp' WHERE id = 1").run();
  const month = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: '2-digit', year: 'numeric' }).format(new Date());
  const rows = [{ line: 2, ean: '7891234567890', month, priceCents: 3705 }];
  const old = service.create(rows).campaign;
  const current = service.create([{ ...rows[0], priceCents: 3499 }]).campaign;
  const config = loadConfig({ NODE_ENV: 'test', APP_AUTH_ENABLED: 'false' });
  const server = createServer(createApplication({ config, database }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const { campaign } = await (await fetch(`${base}/api/revista/active`)).json();
  assert.equal(campaign.id, current.id);
  assert.match(campaign.items[0].imageUrl, /test.webp/);
  const offer = await (await fetch(`${base}/api/revista/active/products/1?campaignId=${current.id}&price=0.01`)).json();
  assert.equal(offer.priceCents, 3499);
  assert.equal(offer.product.id, 1);
  assert.equal((await fetch(`${base}/api/revista/active/products/1?campaignId=${old.id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/revista/active/products/2?campaignId=${current.id}`)).status, 404);
  database.prepare("UPDATE products SET status = 'inativo' WHERE id = 1").run();
  assert.equal((await fetch(`${base}/api/revista/active/products/1?campaignId=${current.id}`)).status, 404);
});

test('removes a campaign and its imported items atomically', async t => {
  const { database, service } = databaseFixture(t);
  const rows = await readRevistaWorkbook(await file([['7891234567890', 19.9, '10/2026']]));
  const campaign = service.create(rows, 'Remover').campaign;
  assert.equal(service.remove(campaign.id), true);
  assert.equal(service.get(campaign.id), null);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM revista_items WHERE campaign_id = ?').get(campaign.id).count, 0);
  assert.equal(service.remove(campaign.id), false);
});

test('rejects corrupt files, wrong columns, extra tabs and excessive row counts', async () => {
  await assert.rejects(readRevistaWorkbook({ filename: 'bad.xlsx', buffer: Buffer.from('invalid') }), /ler o XLSX/);
  await assert.rejects(readRevistaWorkbook({ filename: 'bad.csv', buffer: Buffer.from('EAN') }), /xlsx/);
  await assert.rejects(readRevistaWorkbook(await file([], sheet => { sheet.getCell('B1').value = 'VALOR'; })), /primeira linha/);
  await assert.rejects(readRevistaWorkbook(await file([], (sheet, workbook) => workbook.addWorksheet('Outra').addRow(['dados']))), /uma aba/);
  await assert.rejects(readRevistaWorkbook(await file([], sheet => { sheet.getCell('A2002').value = '12345678'; })), /2.000|2000/);
});

test('HTTP flow downloads template, validates upload, saves and reloads campaign', async t => {
  const { database } = databaseFixture(t);
  const config = loadConfig({ NODE_ENV: 'test', APP_AUTH_ENABLED: 'false' });
  const server = createServer(createApplication({ config, database }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/revista`)).status, 200);
    const template = await fetch(`${base}/api/revista/template`);
    assert.match(template.headers.get('content-disposition'), /modelo-revista.xlsx/);
    assert.match(template.headers.get('content-type'), /spreadsheetml/);
    const input = await file([['7891234567890', 19.9, '10/2026'], ['0012345678905', 37.056250000000006, '10/2026'], ['9999999999999', 9.9, '10/2026']]);
    const body = () => { const form = new FormData(); form.append('file', new Blob([input.buffer]), input.filename); return form; };
    const check = await fetch(`${base}/api/revista/validate`, { method: 'POST', body: body() });
    const report = await check.json();
    assert.equal(report.valid, true);
    assert.equal(report.items.length, 2);
    assert.equal(report.errors.length, 0);
    assert.equal(report.missing.length, 1);
    assert.equal(report.skippedCount, 1);
    const saved = await fetch(`${base}/api/revista/campaigns`, { method: 'POST', body: body() });
    assert.equal(saved.status, 201);
    const { campaign, skippedCount } = await saved.json();
    assert.equal(skippedCount, 1);
    assert.equal(campaign.items.length, 2);
    assert.equal(campaign.items[1].priceCents, 3705);
    const detail = await (await fetch(`${base}/api/revista/campaigns/${campaign.id}`)).json();
    assert.equal(detail.items[0].ean, '7891234567890');
    assert.equal(detail.month, '10/2026');
    assert.equal((await (await fetch(`${base}/api/revista/campaigns`)).json()).items.length, 1);
    assert.equal((await fetch(`${base}/api/revista/campaigns/999999`)).status, 404);
    const removed = await fetch(`${base}/api/revista/campaigns/${campaign.id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { id: campaign.id, removed: true });
    assert.equal((await (await fetch(`${base}/api/revista/campaigns`)).json()).items.length, 0);
    assert.equal((await fetch(`${base}/api/revista/campaigns/${campaign.id}`)).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
