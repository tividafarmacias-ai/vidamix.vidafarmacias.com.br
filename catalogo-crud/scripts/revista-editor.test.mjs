import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/features/revista/editor.js', import.meta.url), 'utf8');
const markup = await readFile(new URL('../public/revista.html', import.meta.url), 'utf8');
class Element {
  children = []; listeners = {}; hidden = false; disabled = false; value = ''; textContent = ''; files = [];
  classList = { toggle() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children.flatMap(child => child.fragment ? child.children : child); }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  setAttribute() {}
  focus() {}
  async emit(event) { await this.listeners[event]?.({ preventDefault() {} }); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(report, options = {}) {
  const elements = new Map([...markup.matchAll(/id="(revista-[^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const calls = [];
  let campaign = options.campaign || null;
  const document = {
    getElementById: id => elements.get(id), createElement: () => new Element(),
    createDocumentFragment: () => Object.assign(new Element(), { fragment: true }),
  };
  const sandbox = vm.createContext({ document, FormData, AbortSignal,
    authFetch: async (url, options) => {
      calls.push({ url, options });
      let data;
      if (url.endsWith('/validate')) data = report;
      else if (options?.method === 'POST') {
        campaign = { id: 1, name: 'Revista 10/2026', month: '10/2026', items: report.items,
          backgrounds: JSON.parse(options.body.get('backgrounds') || '{}') };
        data = { campaign, skippedCount: report.total - report.items.length };
      } else if (options?.method === 'PUT') {
        campaign = { ...campaign, backgrounds: JSON.parse(options.body).backgrounds };
        data = campaign;
      } else if (url === '/api/revista/campaigns') data = { items: campaign ? [{ ...campaign, productCount: campaign.items.length }] : [] };
      else if (url.startsWith('/api/revista/campaigns/')) data = campaign;
      else data = { items: [{ arquivo: 'campanha.png', nome: 'Campanha', thumbnail_url: '/campanha-thumb.png' }] };
      return { ok: true, json: async () => data };
    },
  });
  vm.runInContext(source.replace(/^import .+;\r?\n/gm, ''), sandbox);
  const get = id => elements.get(`revista-${id}`);
  get('file').files = [new File(['test'], 'campanha.xlsx')];
  return { get, calls };
}
const product = { ean: '7891234567890', name: 'Produto', priceCents: 1990 };

test('review lists missing EANs but enables saving only the matched products', async () => {
  const f = fixture({ valid: true, total: 2, items: [product], missing: [{ line: 3, ean: '9999999999999' }], errors: [], month: '10/2026' });
  await settle();
  await f.get('import-form').emit('submit');
  assert.equal(f.get('missing-panel').hidden, false);
  assert.equal(f.get('missing').children[0].children[1].textContent, '9999999999999');
  assert.equal(f.get('create').disabled, false);
  assert.match(f.get('create').textContent, /1 produto válido/);
  await f.get('create').emit('click');
  assert.ok(f.calls.some(call => call.url === '/api/revista/campaigns' && call.options?.method === 'POST'));
  assert.equal(f.get('detail-items').children.length, 1);
  assert.match(f.get('status').textContent, /1 linha foi ignorada/);
  assert.equal(f.get('create').disabled, true);
});

test('no matches cannot save; changing the upload discards the previous review', async () => {
  const f = fixture({ valid: false, total: 1, items: [], missing: [{ line: 2, ean: '9999999999999' }], errors: [], month: '10/2026' });
  await settle();
  await f.get('import-form').emit('submit');
  assert.equal(f.get('create').disabled, true);
  assert.match(f.get('create-hint').textContent, /Nenhum produto válido/);
  await f.get('create').emit('click');
  assert.ok(!f.calls.some(call => call.url === '/api/revista/campaigns' && call.options?.method === 'POST'));
  await f.get('file').emit('change');
  assert.equal(f.get('report').hidden, true);
  assert.equal(f.get('create').disabled, true);
});

test('row errors remain visible while the valid subset can be saved', async () => {
  const f = fixture({ valid: true, total: 3, items: [product], missing: [{ line: 4, ean: '9999999999999' }],
    errors: [{ line: 3, message: 'O preço armazenado tem mais de duas casas decimais.' }], month: '10/2026' });
  await settle();
  await f.get('import-form').emit('submit');
  assert.equal(f.get('errors-panel').hidden, false);
  assert.match(f.get('errors').children[0].textContent, /Linha 3/);
  assert.equal(f.get('missing-panel').hidden, false);
  assert.match(f.get('summary').textContent, /1 válidas para importar · 2 ignoradas/);
  assert.equal(f.get('matched').children.length, 1);
  assert.equal(f.get('create').disabled, false);
  await f.get('create').emit('click');
  assert.equal(f.get('detail-items').children.length, 1);
  assert.match(f.get('status').textContent, /2 linhas foram ignoradas/);
});

test('magazine background selectors preview and save assignments on creation and on existing campaigns', async () => {
  const f = fixture({ valid: true, total: 1, items: [product], missing: [], errors: [], month: '10/2026' });
  await settle();
  const storyPicker = f.get('import-backgrounds').children[0];
  const storySelect = storyPicker.children[1];
  assert.equal(storySelect.disabled, false);
  storySelect.value = 'campanha.png';
  await storySelect.emit('change');
  assert.equal(storyPicker.children[2].src, '/campanha-thumb.png');
  assert.equal(storyPicker.children[2].hidden, false);
  await f.get('import-form').emit('submit');
  await f.get('create').emit('click');
  const saved = f.calls.find(call => call.options?.method === 'POST' && call.url.endsWith('/campaigns'));
  assert.deepEqual(JSON.parse(saved.options.body.get('backgrounds')), { stories: 'campanha.png' });
  const storyDetail = f.get('detail-backgrounds').children[0].children[1];
  const feedDetail = f.get('detail-backgrounds').children[1].children[1];
  assert.equal(storyDetail.value, 'campanha.png');
  storyDetail.value = '';
  feedDetail.value = 'campanha.png';
  await f.get('background-form').emit('submit');
  const update = f.calls.find(call => call.options?.method === 'PUT');
  assert.equal(update.url, '/api/revista/campaigns/1/backgrounds');
  assert.deepEqual(JSON.parse(update.options.body), { backgrounds: { feed: 'campanha.png' } });
  assert.match(f.get('detail-status').textContent, /Backgrounds salvos/);
  await f.get('campaigns').children[0].children.at(-1).children[0].emit('click');
  assert.equal(storyDetail.value, '');
  assert.equal(feedDetail.value, 'campanha.png');
});

test('opening an older magazine keeps an unavailable background visible until it is replaced or removed', async () => {
  const f = fixture(null, { campaign: { id: 7, name: 'Revista antiga', month: '10/2026', items: [product], backgrounds: { stories: 'removido.png' } } });
  await settle();
  await f.get('campaigns').children[0].children.at(-1).children[0].emit('click');
  const picker = f.get('detail-backgrounds').children[0];
  assert.equal(picker.children[1].value, 'removido.png');
  assert.match(picker.children[1].children.at(-1).textContent, /indisponível/);
  assert.equal(picker.children[2].hidden, true);
});
