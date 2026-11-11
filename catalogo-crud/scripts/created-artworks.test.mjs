import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeSchema } from '../src/database/catalog-database.mjs';
import { createArtworkService } from '../src/modules/artworks/artwork-service.mjs';
import { saveCreatedArtwork } from '../public/js/features/created-artworks.js';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { loginDestination } from '../public/js/login.js';
import { getAppScreen } from '../public/js/app-shell.js';

const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
const file = { buffer, contentType: 'image/png', filename: 'oferta.png' };

test('history links restore their destination after login for both account roles', () => {
  for (const role of ['cliente', 'admin']) for (const route of ['/artes-criadas', '/artes-criadas.html']) {
    assert.equal(loginDestination(route, role, 'https://vidamix.test'), '/artes-criadas');
    assert.equal(getAppScreen(route), 'artworks');
  }
});

test('history persists after reopening SQLite and retains five files independently per user', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vidamix-artworks-'));
  let database;
  try {
    const filename = path.join(directory, 'test.sqlite');
    database = new DatabaseSync(filename);
    initializeSchema(database);
    let service = createArtworkService({ database });
    const other = service.create('other', { format: 'feed', title: 'Outra conta' }, file);
    const first = service.create('owner', { format: 'stories', title: 'Primeira' }, file);
    for (let i = 2; i <= 7; i += 1) service.create('owner', { format: 'stories', title: `Arte ${i}` }, file);
    assert.deepEqual(service.list('owner').map(item => item.title), ['Arte 7', 'Arte 6', 'Arte 5', 'Arte 4', 'Arte 3']);
    assert.equal(service.get('owner', first.id), null);
    assert.equal(service.get('owner', other.id), null);
    assert.equal(service.list('other').length, 1);
    assert.equal(database.prepare('SELECT count(*) AS n FROM created_artworks').get().n, 6);
    database.close();
    database = new DatabaseSync(filename);
    initializeSchema(database);
    service = createArtworkService({ database });
    assert.equal(service.list('owner').length, 5);
    assert.deepEqual(Buffer.from(service.get('other', other.id).content), buffer);
    assert.throws(() => service.create('owner', { format: 'stories' }, { ...file, buffer: Buffer.from('<script>bad</script>') }), /PNG ou MP4/);
    assert.throws(() => service.create('owner', { format: 'unknown' }, file), /Formato/);
    assert.equal(service.list('owner').length, 5, 'invalid uploads do not evict previous creations');
  } finally {
    database?.close();
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('vidamix-artworks-')) await rm(directory, { recursive: true, force: true });
  }
});

test('browser uploads the binary artwork and metadata without a client-selected owner', async () => {
  const result = await saveCreatedArtwork({ blob: new Blob([buffer], { type: 'image/png' }), filename: 'oferta.png', title: 'Oferta', format: 'stories' }, async (url, options) => {
    assert.equal(url, '/api/artworks');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('format'), 'stories');
    assert.equal(options.body.get('title'), 'Oferta');
    assert.equal(options.body.has('userId'), false);
    assert.deepEqual(Buffer.from(await options.body.get('artwork').arrayBuffer()), buffer);
    return { ok: true, json: async () => ({ id: 42 }) };
  });
  assert.equal(result.id, 42);
  await assert.rejects(saveCreatedArtwork({ blob: new Blob([buffer]), filename: 'a.png', title: 'A', format: 'feed' }, async () => ({ ok: false, json: async () => ({ error: 'Sessão expirada' }) })), /Sessão expirada/);
});

for (const prefix of ['story', 'feed']) test(`${prefix} PNG export saves the exact downloaded snapshot using the history format`, async () => {
  const source = await readFile(new URL('../public/js/features/stories/editor.js', import.meta.url), 'utf8');
  const saved = [], downloads = [], messages = [];
  let encoding;
  const blob = new Blob([buffer], { type: 'image/png' });
  const state = { selectedProduct: { nome: 'Produto original' }, pngExporting: false };
  const sandbox = vm.createContext({
    state, elements: { download: { disabled: false } }, format: { downloadPrefix: prefix }, STORY_WIDTH: 1080, STORY_HEIGHT: 1920,
    document: { body: { append() {} }, createElement: tag => tag === 'canvas'
      ? { getContext: () => ({}), toBlob: callback => { encoding = callback; } }
      : { click() { downloads.push(this.download); }, remove() {} } },
    URL: { createObjectURL: () => 'blob:artwork', revokeObjectURL() {} }, setTimeout() {},
    updateAvailability() {}, updateDownloadLabel() {}, drawComposition() {},
    storyDownloadName: (name, extension) => `${prefix}-${name}.${extension}`,
    setStatus: text => messages.push(text),
    rememberCreatedArtwork: async artwork => { saved.push(artwork); return 'Salva em Artes criadas.'; },
  });
  vm.runInContext(source.slice(source.indexOf('function downloadStory()'), source.indexOf('function getScaleInputForEditorTarget')), sandbox);
  sandbox.downloadStory();
  assert.equal(state.pngExporting, true);
  state.selectedProduct = { nome: 'Outro produto' };
  await encoding(blob);
  assert.equal(state.pngExporting, false);
  assert.equal(saved[0].blob, blob);
  assert.equal(saved[0].title, 'Produto original');
  assert.equal(saved[0].filename, downloads[0]);
  assert.equal(saved[0].format, prefix === 'story' ? 'stories' : 'feed');
  assert.match(messages.at(-1), /Salva em Artes criadas/);
  sandbox.downloadStory();
  await encoding(null);
  assert.equal(saved.length, 1, 'failed encoding does not create history entries');
});

test('history page renders previews, empty state and retry after a failed load', async () => {
  const source = await readFile(new URL('../public/js/features/artwork-history.js', import.meta.url), 'utf8');
  class Element {
    children = []; hidden = false; textContent = ''; attributes = {};
    classList = { remove() {}, add() {} };
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener() {}
  }
  const nodes = new Map(['artworks-grid', 'artworks-status', 'artworks-retry', 'artworks-empty'].map(id => [id, new Element()]));
  let response = { ok: true, json: async () => ({ items: [
    { id: 2, title: '<Oferta>', format: 'feed', filename: 'oferta.png', contentType: 'image/png', createdAt: '2026-11-10T12:00:00Z', size: 1000 },
    { id: 1, title: 'TV Indoor', format: 'indoor-h', filename: 'tv.mp4', contentType: 'video/mp4', createdAt: '2026-11-10T11:00:00Z', size: 10000 },
  ] }) };
  const sandbox = vm.createContext({
    document: { getElementById: id => nodes.get(id), createElement: tag => Object.assign(new Element(), { tag }) },
    authFetch: async () => response, AbortSignal, Intl, Date,
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('void load();', ''), sandbox);
  await sandbox.load();
  const cards = nodes.get('artworks-grid').children;
  assert.equal(cards.length, 2);
  assert.equal(cards[0].children[0].tag, 'img');
  assert.equal(cards[1].children[0].tag, 'video');
  assert.equal(cards[1].children[0].controls, true);
  assert.equal(cards[0].children[1].children[0].textContent, '<Oferta>');
  assert.equal(cards[0].children[1].children[3].href, '/api/artworks/2/file?download=1');
  response = { ok: false };
  await sandbox.load();
  assert.equal(nodes.get('artworks-grid').children.length, 0);
  assert.equal(nodes.get('artworks-retry').hidden, false);
  response = { ok: true, json: async () => ({ items: [] }) };
  await sandbox.load();
  assert.equal(nodes.get('artworks-retry').hidden, true);
  assert.equal(nodes.get('artworks-empty').hidden, false);
});
