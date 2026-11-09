import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { initializeSchema } from '../src/database/catalog-database.mjs';
import { createRevistaService } from '../src/modules/revista/revista-service.mjs';
import { createApplication } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { adminAuthFixture } from './fixtures/auth.mjs';

test('existing databases migrate without losing campaigns and retain background assignments on restart', t => {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec(`CREATE TABLE revista_campaigns (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, month TEXT NOT NULL,
    import_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
  ); INSERT INTO revista_campaigns VALUES (1, 'Outubro', '10/2026', 'original', '2026-10-01');`);
  initializeSchema(database);
  const service = createRevistaService({ database });
  assert.deepEqual(service.get(1).backgrounds, {});
  const backgrounds = { stories: 'outubro-story.png', feed: 'outubro-feed.webp', 'indoor-h': 'outubro-tv.jpg' };
  service.updateBackgrounds(1, backgrounds);
  initializeSchema(database);
  assert.deepEqual(createRevistaService({ database }).get(1).backgrounds, backgrounds);
  assert.equal(service.list()[0].name, 'Outubro');
  assert.deepEqual(service.list()[0].backgrounds, backgrounds);
  assert.throws(() => service.updateBackgrounds(1, { stories: '../outro.png' }), /válido/);
  assert.throws(() => service.updateBackgrounds(1, { stories: 'abertura-wallpaper.png' }), /válido/);
  assert.throws(() => service.updateBackgrounds(1, { invalid: 'outro.png' }), /Formato/);
  assert.deepEqual(service.updateBackgrounds(1, { stories: null, feed: '' }).backgrounds, {});
  assert.equal(service.updateBackgrounds(99, {}), null);
});

test('campaign HTTP flow saves, changes and clears real backgrounds by format and supplies them with the offer', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'revista-backgrounds-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directories = Object.fromEntries(['stories', 'feed', 'indoor-h'].map(format => [format, path.join(root, format)]));
  const backgrounds = { stories: 'outubro-story.png', feed: 'outubro-feed.webp', 'indoor-h': 'outubro-tv.jpg' };
  for (const [format, directory] of Object.entries(directories)) {
    await mkdir(directory);
    await writeFile(path.join(directory, backgrounds[format]), 'background inventory fixture');
  }
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  initializeSchema(database);
  database.exec(`INSERT INTO products (id, nome, ean, imagem_arquivo, created_at, updated_at)
    VALUES (1, 'Produto da revista', '7891234567890', 'imagens/test.webp', '2026-10-01', '2026-10-01');`);
  const config = loadConfig({ NODE_ENV: 'test', STORY_BACKGROUNDS_ROOT: directories.stories,
    FEED_BACKGROUNDS_ROOT: directories.feed, INDOOR_BACKGROUNDS_ROOT: directories['indoor-h'] });
  let role = 'admin';
  const auth = adminAuthFixture();
  const getSession = auth.getSession;
  auth.getSession = async request => { const session = await getSession(request); return { ...session, user: { ...session.user, role } }; };
  const server = createServer(createApplication({ config, database, authService: auth }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const month = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: '2-digit', year: 'numeric' }).format(new Date());
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Revista');
  sheet.addRow(['EAN', 'PREÇO', 'VIGENCIA']); sheet.addRow(['7891234567890', 19.9, month]);
  const buffer = await workbook.xlsx.writeBuffer();
  const create = (value) => {
    const body = new FormData(); body.append('file', new Blob([buffer]), 'revista.xlsx');
    body.append('backgrounds', JSON.stringify(value));
    return fetch(`${base}/api/revista/campaigns`, { method: 'POST', body });
  };
  const saved = await create(backgrounds);
  assert.equal(saved.status, 201);
  const { campaign } = await saved.json();
  assert.deepEqual(campaign.backgrounds, backgrounds);
  const update = value => fetch(`${base}/api/revista/campaigns/${campaign.id}/backgrounds`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backgrounds: value }),
  });
  for (const url of ['/api/revista/active', `/api/revista/campaigns/${campaign.id}`, '/api/revista/campaigns']) {
    const result = await (await fetch(base + url)).json();
    const entry = url === '/api/revista/active' ? result.campaign : url === '/api/revista/campaigns' ? result.items[0] : result;
    assert.deepEqual(entry.backgrounds, backgrounds);
  }
  const offerUrl = `${base}/api/revista/active/products/1?campaignId=${campaign.id}&background=forged.png`;
  const offer = await (await fetch(offerUrl)).json();
  assert.deepEqual(offer.backgrounds, backgrounds);
  assert.equal(offer.priceCents, 1990);
  assert.equal((await create({ stories: 'absent.png' })).status, 400);
  for (const invalid of [null, [], { stories: '../file.png' }, { stories: 'absent.png' }, { stories: backgrounds.feed }]) {
    assert.equal((await update(invalid)).status, 400);
  }
  assert.deepEqual((await (await fetch(offerUrl)).json()).backgrounds, backgrounds, 'invalid writes are atomic');
  const feedOnly = { feed: backgrounds.feed };
  assert.deepEqual((await (await update(feedOnly)).json()).backgrounds, feedOnly);
  const retry = await (await create(backgrounds)).json();
  assert.equal(retry.existing, true);
  assert.deepEqual(retry.campaign.backgrounds, feedOnly, 'reimport never overwrites an existing campaign');
  role = 'cliente';
  assert.equal((await update({})).status, 403);
  assert.deepEqual((await (await fetch(offerUrl)).json()).backgrounds, feedOnly);
  role = 'admin';
  assert.deepEqual((await (await update({})).json()).backgrounds, {});
  assert.deepEqual((await (await fetch(offerUrl)).json()).backgrounds, {});
  assert.equal((await fetch(`${base}/api/revista/campaigns/999/backgrounds`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backgrounds }),
  })).status, 404);
});
