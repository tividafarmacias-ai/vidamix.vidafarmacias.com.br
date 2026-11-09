import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { campaignArtworkUrl } from '../public/js/features/revista/artwork.js';
import { PRODUCT_LIMIT } from '../public/js/features/indoor/model.js';

const markup = await readFile(new URL('../public/revista-ofertas.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../public/js/features/revista/offers.js', import.meta.url), 'utf8');
class Element {
  children = []; listeners = {}; hidden = false; value = ''; textContent = ''; attributes = {}; dataset = {};
  classList = { add() {}, toggle() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  setAttribute(key, value) { this.attributes[key] = value; }
  emit(event) { this.listeners[event]?.(); }
  focus() { this.focused = true; }
  querySelector(selector) { return selector === 'input' ? this.children[0]?.children[0] : null; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ campaign, fail = false, saved = [] } = {}) {
  const elements = new Map([...markup.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const actions = ['indoor-h', 'feed', 'stories'].map(format => Object.assign(new Element(), { dataset: { batchFormat: format }, disabled: true }));
  let selection, destination;
  const sandbox = vm.createContext({ campaignArtworkUrl, PRODUCT_LIMIT, AbortSignal, encodeURIComponent,
    document: { getElementById: id => elements.get(id), createElement: () => new Element(), querySelectorAll: () => actions },
    window: { location: { assign: url => { destination = url; } } },
    sessionStorage: { getItem: () => JSON.stringify(saved), setItem() {} },
    saveCampaignSelection: (id, ids) => { selection = { id, ids: [...ids] }; return 'batch-token'; },
    authFetch: async () => ({ ok: !fail, json: async () => ({ campaign }) }),
  });
  vm.runInContext(source.replace(/^import .+;\r?\n/gm, ''), sandbox);
  return { get: id => elements.get(`offers-${id}`), actions, selection: () => selection, destination: () => destination };
}
const campaign = { id: 5, name: 'Revista atual', month: '11/2026', items: Array.from({ length: 27 }, (_, i) => ({
  productId: i + 1, name: i === 0 ? 'Proteção solar' : `Produto ${i + 1}`, manufacturer: 'Marca', ean: `78912345678${i}`,
  priceCents: 3705, imageUrl: '/product.png', available: i !== 26,
})) };
const input = (f, index) => f.get('products').children[index].children[0].children[0];

test('selection survives search and pagination, skips unavailable products and keeps large batches for Feed and Stories', async () => {
  const f = fixture({ campaign });
  await settle();
  assert.equal(f.get('products').children.length, 24);
  assert.ok(f.actions.every(button => button.disabled));
  input(f, 0).checked = true; input(f, 0).emit('change');
  f.get('search').value = 'produto'; f.get('search').emit('input');
  assert.equal(f.get('count').textContent, '1 produto selecionado');
  f.get('select-all').emit('click');
  assert.equal(f.get('count').textContent, '26 produtos selecionados');
  f.get('search').value = 'protecao'; f.get('search').emit('input');
  assert.equal(f.get('products').children.length, 1);
  assert.equal(input(f, 0).checked, true);
  f.get('search').value = ''; f.get('search').emit('input');
  f.get('more').emit('click');
  assert.equal(f.get('products').children.length, 27);
  assert.equal(input(f, 26).disabled, true);
  assert.equal(input(f, 24).focused, true);
  assert.equal(f.actions[0].disabled, true);
  f.actions[0].emit('click');
  assert.equal(f.destination(), undefined);
  assert.equal(f.selection(), undefined);
  for (const button of f.actions.slice(1)) {
    assert.equal(button.disabled, false);
    button.emit('click');
    assert.equal(f.destination(), `/artes/${button.dataset.batchFormat}?selection=batch-token`);
    assert.equal(f.selection().id, 5);
    assert.deepEqual(f.selection().ids, Array.from({ length: 26 }, (_, i) => i + 1));
  }
  f.get('clear').emit('click');
  assert.ok(f.actions.every(button => button.disabled));
});

test('Indoor allows up to five products, blocks the sixth and unlocks after deselection', async () => {
  const f = fixture({ campaign });
  await settle();
  const indoor = f.actions[0];
  indoor.emit('click');
  assert.equal(f.destination(), undefined);
  for (let i = 0; i < 5; i += 1) {
    input(f, i).checked = true; input(f, i).emit('change');
    assert.equal(indoor.disabled, false);
  }
  input(f, 5).checked = true; input(f, 5).emit('change');
  assert.equal(indoor.disabled, true);
  assert.match(indoor.textContent, /máx\. 5 produtos/);
  assert.ok(f.actions.slice(1).every(button => !button.disabled));
  indoor.emit('click');
  assert.equal(f.selection(), undefined);
  assert.equal(f.destination(), undefined);
  input(f, 5).checked = false; input(f, 5).emit('change');
  assert.equal(indoor.disabled, false);
  assert.equal(indoor.textContent, 'Criar vídeo Indoor');
  assert.equal(indoor.title, '');
  indoor.emit('click');
  assert.equal(f.destination(), '/artes/indoor-h?selection=batch-token');
  assert.deepEqual(f.selection().ids, [1, 2, 3, 4, 5]);
  f.get('clear').emit('click');
  assert.ok(f.actions.every(button => button.disabled));
});

test('restored selections above five products disable Indoor even when search hides selected products', async () => {
  const f = fixture({ campaign, saved: [1, 2, 3, 4, 5, 6] });
  await settle();
  assert.equal(f.actions[0].disabled, true);
  f.get('search').value = 'protecao'; f.get('search').emit('input');
  assert.equal(f.get('products').children.length, 1);
  assert.equal(f.actions[0].disabled, true);
  assert.ok(f.actions.slice(1).every(button => !button.disabled));
});

test('returning to the magazine restores available selections and handles empty and failed campaigns', async () => {
  const restored = fixture({ campaign, saved: [1, 27, 9999] });
  const empty = fixture({ campaign: null });
  const failed = fixture({ fail: true });
  await settle();
  assert.equal(restored.get('count').textContent, '1 produto selecionado');
  assert.equal(input(restored, 0).checked, true);
  assert.match(empty.get('status').textContent, /Nenhuma revista vigente/);
  assert.equal(failed.get('retry').hidden, false);
});
