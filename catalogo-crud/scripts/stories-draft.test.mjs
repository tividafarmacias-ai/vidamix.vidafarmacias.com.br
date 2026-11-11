import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import * as constants from '../public/js/features/stories/constants.js';
import { getArtworkFormat } from '../public/js/features/stories/formats.js';
import { getStoriesEditorElements } from '../public/js/features/stories/dom.js';
import { createStoriesEditorState } from '../public/js/features/stories/state.js';
import { bindPriceInput } from '../public/js/features/stories/price-input.js';
import { loadArtworkSelection } from '../public/js/features/revista/artwork.js';
import { createArtworkDraftStore, findDraftBackground } from '../public/js/features/artwork-draft.js';
import { memoryStorage } from './fixtures/artwork-draft.mjs';

const source = (await readFile(new URL('../public/js/features/stories/editor.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '').replace('export async function', 'async function');

class Element {
  value = ''; checked = false; dataset = {}; style = {}; children = []; listeners = new Map();
  classList = { contains: () => false, toggle() {}, add() {}, remove() {} };
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this }); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector() { return null; }
  closest() { return null; }
  contains() { return false; }
  setAttribute() {}
  removeAttribute() {}
  focus() {}
  setSelectionRange() {}
}

const products = [1, 2].map(id => ({ id, nome: `Produto ${id}`, imagem_local_url: `/produto-${id}.png` }));
const backgrounds = [1, 2].map(id => ({ arquivo: `fundo-${id}.png`, nome: `Fundo ${id}`, url: `/fundo-${id}.png` }));

async function openEditor(storage, formatName = 'stories', search = '', availableBackgrounds = backgrounds, duringLoad) {
  const document = new Element();
  const nodes = new Map();
  document.body = new Element();
  document.body.dataset.artworkFormat = formatName;
  document.createElement = () => new Element();
  document.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const modes = ['single', 'two-products', 'combo'].map(value => Object.assign(new Element(), { value, checked: value === 'single' }));
  document.querySelectorAll = selector => selector.includes('story-composition-mode') ? modes : [];
  const window = Object.assign(new Element(), { location: { search } });
  const requests = [];
  const sandbox = vm.createContext({
    ...constants, document, window, URLSearchParams, Image: Element,
    getArtworkFormat, getStoriesEditorElements: () => getStoriesEditorElements(document), createStoriesEditorState,
    bindPriceInput, loadArtworkSelection, findDraftBackground,
    createArtworkDraftStore: (format, options) => createArtworkDraftStore(format, { ...options, storage }),
    initStoriesMobileEditor: () => ({ sync() {}, selectionComplete() {} }),
    initCampaignBatchEditor: async () => false,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    authFetch: async url => {
      requests.push(url);
      const payload = url.includes('backgrounds') ? { items: availableBackgrounds }
        : url.startsWith('/api/products/') ? products.find(product => product.id === Number(url.split('/').at(-1)))
          : { product: products[0], priceCents: 3705 };
      return { ok: true, json: async () => payload };
    },
  });
  // Use the actual initialization and event handlers; only rendering, gestures and catalogue loading are substituted.
  vm.runInContext(`${source}
    drawPreviewNow = () => {};
    renderPreviewOnce = async () => { syncPriceInputs(); };
    syncProductEditor = () => syncPriceInputs();
    updateAvailability = () => {};
    renderProducts = () => {};
    loadProducts = async () => {};
    setPreviewZoom = () => {};
    setThirdsGridVisible = () => {};
    resetFreeTextTransform = () => {};
    globalThis.editor = { state, elements };
  `, sandbox);
  const initialized = sandbox.initStoriesEditor();
  duringLoad?.({ window, document });
  await initialized;
  return { ...sandbox.editor, sandbox, document, window, requests };
}

for (const format of ['stories', 'feed']) {
  test(`${format} restores two products, promotion prices, text and selected background after refresh`, async () => {
    const storage = memoryStorage();
    const f = await openEditor(storage, format);
    f.sandbox.setCompositionMode('two-products');
    products.forEach(product => f.sandbox.selectProductForComposition(product));
    for (const [field, value] of [['price', '1990'], ['secondaryPrice', '2990'], ['originalPrice', '3990'], ['secondaryOriginalPrice', '4990']]) {
      f.elements[field].value = value;
      f.elements[field].dispatch('input');
    }
    f.elements.useOriginalPrice.checked = true;
    f.elements.useOriginalPrice.dispatch('change');
    f.elements.freeText.value = 'Oferta especial';
    f.elements.freeText.dispatch('input');
    f.elements.backgrounds.children[1].dispatch('click');

    // No unload or animation frame is needed for the last edit to be saved.
    const restored = await openEditor(storage, format);
    assert.equal(restored.state.compositionMode, 'two-products');
    assert.equal(restored.state.selectedProduct.id, 1);
    assert.equal(restored.state.secondaryProduct.id, 2);
    assert.equal(restored.state.selectedBackground.arquivo, backgrounds[1].arquivo);
    assert.equal(restored.elements.price.value, '19,90');
    assert.equal(restored.elements.secondaryPrice.value, '29,90');
    assert.equal(restored.elements.originalPrice.value, '39,90');
    assert.equal(restored.elements.secondaryOriginalPrice.value, '49,90');
    assert.equal(restored.elements.useOriginalPrice.checked, true);
    assert.equal(restored.elements.freeText.value, 'Oferta especial');
    assert.equal(restored.elements.compositionModes[1].checked, true);

    restored.elements.removeAllProducts.dispatch('click');
    const empty = await openEditor(storage, format);
    assert.equal(empty.state.selectedProduct, null);
    assert.equal(empty.state.secondaryProduct, null);
    assert.equal(empty.elements.price.value, '');
    assert.equal(empty.state.selectedBackground.arquivo, backgrounds[1].arquivo);
  });
}

test('refreshing a product link preserves edits, while another product link starts a new selection', async () => {
  const storage = memoryStorage();
  const f = await openEditor(storage, 'stories', '?productId=1');
  assert.equal(f.state.selectedProduct.id, 1);
  f.elements.price.value = '999'; f.elements.price.dispatch('input');
  const restored = await openEditor(storage, 'stories', '?productId=1');
  assert.equal(restored.elements.price.value, '9,99');
  assert.ok(!restored.requests.includes('/api/products/1'));
  const next = await openEditor(storage, 'stories', '?productId=2');
  assert.equal(next.state.selectedProduct.id, 2);
  assert.equal(next.elements.price.value, '');
});

test('a removed saved background preserves products and prices and asks for a replacement', async () => {
  const storage = memoryStorage();
  const f = await openEditor(storage);
  f.sandbox.selectProductForComposition(products[0]);
  f.elements.price.value = '999'; f.elements.price.dispatch('input');
  f.elements.backgrounds.children[1].dispatch('click');
  const restored = await openEditor(storage, 'stories', '', [backgrounds[0]]);
  assert.equal(restored.state.selectedBackground, null);
  assert.equal(restored.state.selectedProduct.id, 1);
  assert.equal(restored.elements.price.value, '9,99');
  assert.match(restored.state.campaignBackgroundError, /fundo salvo não está mais disponível/);
});

test('leaving a newly linked product before it loads does not overwrite the previous draft', async () => {
  const storage = memoryStorage();
  createArtworkDraftStore('stories', { storage }).save({ selectedProduct: products[1], price: '17,90' });
  const previous = [...storage.items.values()][0];
  await openEditor(storage, 'stories', '?productId=1', backgrounds, ({ window }) => {
    window.dispatch('pagehide');
    assert.equal([...storage.items.values()][0], previous);
  });
  assert.equal(createArtworkDraftStore('stories', { storage }).load().selectedProduct.id, 1);
});
