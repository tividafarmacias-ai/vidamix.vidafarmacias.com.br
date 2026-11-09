import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { loadCampaignSelection, saveCampaignSelection } from '../public/js/features/revista/selection.js';
import { exportArtworkBatch } from '../public/js/features/revista/zip.js';

const source = await readFile(new URL('../public/js/features/revista/batch-editor.js', import.meta.url), 'utf8');
class Element {
  listeners = {}; hidden = false; disabled = false; inert = false; attributes = {}; textContent = '';
  classList = { add() {}, toggle() {} };
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; delete this[key]; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  focus() {}
  click() { this.clicks = (this.clicks || 0) + 1; return this.listeners.click?.(); }
}
async function fixture(t, options = {}) {
  const controls = Object.fromEntries(['[data-batch-start]', '[data-batch-cancel]', '[data-batch-download]', '[data-batch-status]', 'progress'].map(key => [key, new Element()]));
  const panel = new Element(); panel.querySelector = key => controls[key];
  const main = new Element(); main.before = () => {};
  const surfaces = [main, new Element()];
  const storage = new Map();
  const store = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const token = saveCampaignSelection(5, [1, 2], store);
  const window = new Element(); window.location = { search: `?selection=${token}` };
  const downloads = [], revoked = [], busy = [], prepared = [], rendered = [];
  let requests = 0;
  const sandbox = vm.createContext({
    document: { createElement: () => panel, querySelector: () => main, querySelectorAll: () => surfaces, body: new Element() },
    window, URLSearchParams, AbortController,
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:zip'; }, revokeObjectURL: url => revoked.push(url) },
    loadCampaignSelection: (search, request) => loadCampaignSelection(search, request, store), exportArtworkBatch,
  });
  vm.runInContext(source.replace(/^import .+;\r?\n/gm, '').replace('export async function', 'async function'), sandbox);
  await sandbox.initCampaignBatchEditor({ format: options.format || 'feed', isBusy: () => false,
    request: async () => {
      requests += 1;
      return { campaign: { id: options.stale && requests > 1 ? 6 : 5, name: 'Revista', items: [1, 2].map(id => ({
        productId: id, name: 'Produto ' + id, available: true, imageUrl: '/image.png', priceCents: requests > 1 ? 4200 : 3705,
      })) } };
    },
    prepare: async batch => prepared.push(batch),
    setBusy: value => busy.push(value),
    render: async item => {
      rendered.push(item);
      assert.ok(surfaces.every(surface => surface.inert));
      if (options.cancel) controls['[data-batch-cancel]'].click();
      if (options.failure) throw new Error('Imagem indisponível');
      return new Blob(['PNG']);
    },
  });
  t.after(() => window.listeners.pagehide());
  return { controls, surfaces, downloads, revoked, busy, prepared, rendered, window };
}

for (const format of ['feed', 'stories']) test(`${format} batch refreshes prices, locks editing and publishes a downloadable ZIP`, async t => {
  const f = await fixture(t, { format });
  assert.equal(f.prepared[0].items[0].price, '37,05');
  await f.controls['[data-batch-start]'].click();
  assert.deepEqual(f.rendered.map(item => item.price), ['42,00', '42,00']);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0].type, 'application/zip');
  assert.equal(f.controls['[data-batch-download]'].download, `revista-5-${format}.zip`);
  assert.equal(f.controls['[data-batch-download]'].clicks, 1);
  assert.equal(f.controls['[data-batch-start]'].disabled, false);
  assert.ok(f.surfaces.every(surface => !surface.inert));
  assert.deepEqual(f.busy, [true, false]);
  f.window.listeners.pagehide();
  assert.deepEqual(f.revoked, ['blob:zip']);
});

for (const option of ['cancel', 'failure', 'stale']) test(`${option} restores editing and never downloads a partial batch`, async t => {
  const f = await fixture(t, { [option]: true });
  await f.controls['[data-batch-start]'].click();
  assert.equal(f.downloads.length, 0);
  assert.ok(f.surfaces.every(surface => !surface.inert));
  assert.equal(f.controls['[data-batch-start]'].disabled, false);
  assert.equal(f.controls['[data-batch-cancel]'].hidden, true);
  assert.match(f.controls['[data-batch-status]'].textContent, /cancelado|Imagem indisponível|revista vigente mudou/);
  assert.equal(f.rendered.length, option === 'stale' ? 0 : 1);
});

test('shared Stories and Feed renderer resets offers before each batch artwork', async () => {
  const editor = await readFile(new URL('../public/js/features/stories/editor.js', import.meta.url), 'utf8');
  const calls = [];
  const state = { compositionMode: 'combo', originalPrice: '99,90', useOriginalPrice: true, secondaryProduct: { id: 7 }, secondaryPrice: '1,00' };
  const sandbox = vm.createContext({ state,
    resetProductCompositionState: () => calls.push('reset'), syncPriceInputs() {}, syncCompositionModeControls() {}, syncProductPanel() {},
    renderPreview: async () => calls.push('render'), applyAutoLayout: () => calls.push('layout'),
  });
  vm.runInContext(editor.slice(editor.indexOf('async function prepareBatchItem(')), sandbox);
  const item = { product: { id: 1 }, price: '37,05' };
  await sandbox.prepareBatchItem(item);
  assert.equal(state.selectedProduct, item.product);
  assert.equal(state.price, '37,05');
  assert.equal(state.compositionMode, 'single');
  assert.equal(state.secondaryProduct, null);
  assert.equal(state.originalPrice, '');
  assert.equal(state.useOriginalPrice, false);
  assert.deepEqual(calls, ['reset', 'render', 'layout']);
});
