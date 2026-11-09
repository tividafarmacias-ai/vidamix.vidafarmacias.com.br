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

test('home keeps the campaign call to action and moves product browsing to its own screen', async () => {
  const f = fixture({ campaign: { id: 5, name: 'Ofertas de outubro', month: '10/2026', items: [item] } });
  await settle();
  assert.equal(f.get('campaign-action').hidden, false);
  assert.equal(f.get('campaign-month').textContent, 'outubro');
  assert.match(markup, /id="home-campaign-action" href="\/revista\/ofertas"/);
  assert.doesNotMatch(markup, /id="home-revista-(?:products|search|more)"/);
});

test('home preserves general hero without a current campaign and offers retry on network failure', async () => {
  const empty = fixture({ campaign: null });
  const failed = fixture(null, true);
  await settle();
  assert.equal(empty.get('campaign-cover').hidden, true);
  assert.equal(empty.get('campaign-action').hidden, true);
  assert.match(empty.get('revista-status').textContent, /Nenhuma revista vigente/);
  assert.equal(failed.get('revista-retry').hidden, false);
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

test('Story and Feed select their saved magazine background, preserving wallpapers and handling removed backgrounds', async () => {
  const editor = await readFile(new URL('../public/js/features/stories/editor.js', import.meta.url), 'utf8');
  const start = editor.indexOf('async function preselectProductFromLocation(');
  const source = editor.slice(start, editor.indexOf('\nfunction renderProducts(', start));
  for (const format of ['story', 'feed']) {
    for (const missing of [false, true]) {
      const linked = { arquivo: `${format}.png`, url: '/selected.png', wallpaper_url: '/wallpaper.png' };
      const unrelated = { arquivo: 'default.png', url: '/default.png' };
      const state = { price: '', secondaryProduct: null, backgrounds: missing ? [unrelated] : [unrelated, linked], selectedBackground: unrelated };
      const sandbox = vm.createContext({ state, loadArtworkSelection, URLSearchParams, format: { downloadPrefix: format },
        window: { location: { search: '?productId=1&campaignId=5' } },
        requestJson: async () => ({ product: { id: 1 }, priceCents: 3705, backgrounds: { stories: 'story.png', feed: 'feed.png' } }),
        syncPriceInputs() {}, syncProductPanel() {}, resetProductCompositionState() {},
        addProductToResults() {}, renderProducts() {}, renderBackgrounds() {}, setStatus() {},
        setPanelCollapsed() {}, backgroundPanel: {},
      });
      vm.runInContext(source, sandbox);
      assert.equal(await sandbox.preselectProductFromLocation(), true);
      assert.equal(state.price, '37,05');
      assert.equal(state.selectedBackground, missing ? null : linked);
      assert.equal(state.backgroundChosen, !missing);
      assert.equal(Boolean(state.campaignBackgroundError), missing);
    }
  }
});
