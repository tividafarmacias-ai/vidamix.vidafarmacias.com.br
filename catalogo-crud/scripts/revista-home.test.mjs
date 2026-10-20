import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { campaignArtworkUrl, loadArtworkSelection } from '../public/js/features/revista/artwork.js';

const markup = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../public/js/features/revista/home.js', import.meta.url), 'utf8');
class Element {
  children = []; listeners = {}; hidden = false; value = ''; textContent = ''; attributes = {};
  classList = { add() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  setAttribute(key, value) { this.attributes[key] = value; }
  emit(event) { this.listeners[event]?.(); }
  focus() { this.focused = true; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(payload, failure = false) {
  const elements = new Map([...markup.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  elements.get('home-campaign-cover').hidden = true;
  elements.get('home-campaign-action').hidden = true;
  const sandbox = vm.createContext({ campaignArtworkUrl, AbortSignal,
    document: { getElementById: id => elements.get(id), createElement: () => new Element() },
    authFetch: async () => ({ ok: !failure, json: async () => payload }),
  });
  vm.runInContext(source.replace(/^import .+;\r?\n/gm, ''), sandbox);
  return { get: id => elements.get(`home-${id}`) };
}
const item = { productId: 1, name: 'Proteção solar', manufacturer: 'Marca', ean: '7891234567890', priceCents: 3705, imageUrl: '/assets/imagens/produto.webp?v=1', available: true };

test('home highlights active campaign, paginates, searches and links all formats with the campaign context', async () => {
  const f = fixture({ campaign: { id: 5, name: 'Ofertas de outubro', month: '10/2026', items: Array.from({ length: 26 }, (_, i) => ({ ...item, productId: i + 1 })) } });
  await settle();
  assert.equal(f.get('campaign-action').hidden, false);
  assert.equal(f.get('campaign-month').textContent, 'outubro');
  assert.equal(f.get('revista-products').children.length, 24);
  const body = f.get('revista-products').children[0].children[1];
  assert.match(body.children[4].children[1].textContent, /37,05/);
  assert.deepEqual(body.children.at(-1).children.map(link => link.href),
    ['stories', 'feed', 'indoor-h'].map(format => `/artes/${format}?productId=1&campaignId=5`));
  f.get('revista-more').emit('click');
  assert.equal(f.get('revista-products').children.length, 26);
  assert.equal(f.get('revista-more').hidden, true);
  assert.equal(f.get('revista-products').children[24].focused, true);
  f.get('revista-search').value = 'protecao';
  f.get('revista-search').emit('input');
  assert.equal(f.get('revista-products').children.length, 24);
  f.get('revista-search').value = 'sem resultado';
  f.get('revista-search').emit('input');
  assert.equal(f.get('revista-products').children.length, 0);
  assert.match(f.get('revista-status').textContent, /Nenhum produto/);
});

test('home preserves general hero without a current campaign and offers retry on network failure', async () => {
  const empty = fixture({ campaign: null });
  const failed = fixture(null, true);
  const unavailable = fixture({ campaign: { id: 1, name: 'Atual', month: '10/2026', items: [{ ...item, available: false }] } });
  await settle();
  assert.equal(empty.get('campaign-cover').hidden, true);
  assert.equal(empty.get('campaign-action').hidden, true);
  assert.match(empty.get('revista-status').textContent, /Nenhuma revista vigente/);
  assert.equal(failed.get('revista-retry').hidden, false);
  assert.match(unavailable.get('revista-products').children[0].children[1].children.at(-1).textContent, /indisponível/);
});

test('artwork selection loads authoritative campaign price and preserves ordinary catalogue links', async () => {
  const calls = [];
  const request = async url => { calls.push(url); return { product: { id: 1 }, priceCents: 3705 }; };
  assert.equal((await loadArtworkSelection('?productId=1&campaignId=5&price=0.01', request)).price, '37,05');
  assert.equal(calls[0], '/api/revista/active/products/1?campaignId=5');
  assert.deepEqual(await loadArtworkSelection('?productId=1', async () => ({ id: 1 })), { product: { id: 1 } });
  assert.equal(await loadArtworkSelection('?productId=NaN', request), null);
  await assert.rejects(loadArtworkSelection('?productId=1&campaignId=5', async () => { throw new Error('Oferta vencida'); }), /vencida/);
});

test('shared Story and Feed controller preselects the product and fills its price field', async () => {
  const editor = await readFile(new URL('../public/js/features/stories/editor.js', import.meta.url), 'utf8');
  const state = { price: '', secondaryProduct: null };
  const priceInput = { value: '' };
  const sandbox = vm.createContext({ state, loadArtworkSelection, URLSearchParams,
    window: { location: { search: '?productId=1&campaignId=5' } },
    requestJson: async () => ({ product: { id: 1 }, priceCents: 3705 }),
    syncPriceInputs() { priceInput.value = state.price; }, syncProductPanel() {}, resetProductCompositionState() {},
    addProductToResults() {}, renderProducts() {}, setStatus() {},
  });
  const start = editor.indexOf('async function preselectProductFromLocation(');
  vm.runInContext(editor.slice(start, editor.indexOf('\nfunction renderProducts(', start)), sandbox);
  assert.equal(await sandbox.preselectProductFromLocation(), true);
  assert.equal(state.selectedProduct.id, 1);
  assert.equal(priceInput.value, '37,05');
});
