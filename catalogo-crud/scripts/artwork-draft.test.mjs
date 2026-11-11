import assert from 'node:assert/strict';
import test from 'node:test';
import { createArtworkDraftStore, findDraftBackground } from '../public/js/features/artwork-draft.js';
import { createStoriesEditorState } from '../public/js/features/stories/state.js';
import { memoryStorage } from './fixtures/artwork-draft.mjs';

const product = { id: 1, nome: 'Produto', subtitulo: 'Descrição', imagem_local_url: '/produto.png' };
const background = { arquivo: 'campanha.png', nome: 'Campanha', url: '/campanha.png?v=1' };

test('each format restores its own products, prices and background across store instances', () => {
  const storage = memoryStorage();
  for (const [format, price] of [['stories', '19,90'], ['feed', '29,90']]) {
    const state = { ...createStoriesEditorState(), selectedProduct: product, selectedBackground: background, price };
    state.productImage = state; // Browser-only resources must never be serialized.
    assert.equal(createArtworkDraftStore(format, { storage }).save(state), true);
  }
  createArtworkDraftStore('indoor-h', { storage }).save({ selection: [{ product, price: '39,90' }], background });
  assert.equal(storage.items.size, 3);
  for (const [format, price] of [['stories', '19,90'], ['feed', '29,90']]) {
    const draft = createArtworkDraftStore(format, { storage }).load();
    assert.equal(draft.price, price);
    assert.deepEqual(draft.selectedProduct, product);
    assert.deepEqual(draft.selectedBackground, background);
    assert.equal('productImage' in draft, false);
  }
  assert.equal(createArtworkDraftStore('indoor-h', { storage }).load().selection[0].price, '39,90');
});

test('reload keeps edits from the same link; a different product or campaign takes precedence', () => {
  const storage = memoryStorage();
  const search = '?productId=1&campaignId=5';
  createArtworkDraftStore('stories', { storage, search }).save({ selectedProduct: product, price: '17,99' });
  for (const query of ['', search, '?campaignId=5&productId=1&utm_source=home']) {
    assert.equal(createArtworkDraftStore('stories', { storage, search: query }).load().price, '17,99');
  }
  for (const query of ['?productId=2', '?productId=1&campaignId=6', '?selection=new']) {
    assert.equal(createArtworkDraftStore('stories', { storage, search: query }).load(), null);
  }
});

test('empty edits replace old drafts and repeated paints do not write unchanged data', () => {
  const storage = memoryStorage();
  const save = storage.setItem;
  let writes = 0;
  storage.setItem = (...args) => { writes++; save(...args); };
  const store = createArtworkDraftStore('feed', { storage });
  store.save({ selectedProduct: product, price: '10,00' });
  store.save({ selectedProduct: product, price: '10,00', imageCache: new Map() });
  assert.equal(writes, 1);
  store.save(createStoriesEditorState());
  const draft = createArtworkDraftStore('feed', { storage }).load();
  assert.equal(draft.selectedProduct, null);
  assert.equal(draft.price, '');
});

test('corrupt, incompatible and unavailable storage never prevents editing', () => {
  const storage = memoryStorage();
  const store = createArtworkDraftStore('stories', { storage });
  store.save({ price: '10,00' });
  const key = [...storage.items.keys()][0];
  for (const value of ['{invalid', 'null', '{"version":99}', '{"version":1,"data":[]}']) {
    storage.setItem(key, value);
    assert.equal(store.load(), null);
  }
  const blocked = createArtworkDraftStore('feed', { storage: {
    getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); },
  } });
  assert.equal(blocked.load(), null);
  assert.equal(blocked.save({ price: '10,00' }), false);
  assert.equal(createArtworkDraftStore('stories').load(), null);
});

test('stored background resolves to current asset URLs, or null when removed', () => {
  const current = { ...background, url: '/campanha.png?v=2', wallpaper_url: '/abertura.png' };
  assert.equal(findDraftBackground([current], background), current);
  assert.equal(findDraftBackground([], background), null);
});
