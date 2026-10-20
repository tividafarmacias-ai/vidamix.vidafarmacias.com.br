import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const [markup, script] = await Promise.all([
  readFile(new URL('../public/catalogo.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
]);

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
}

async function openCatalogue({ productsError = () => null, empty = false, role = 'admin' } = {}) {
  // Resolve selectors against the real page: removed elements must return null.
  const elements = new Map([...markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => {
    const element = new Element();
    element.hidden = /\bhidden(?:\s|[=>])/.test(tag);
    return [id, element];
  }));
  const fields = new Map([...markup.matchAll(/<(input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/g)].map(([tag, type, name]) => {
    const field = new Element();
    field.matches = () => type === 'select' || /\btype="(?:checkbox|file)"/.test(tag);
    return [name, field];
  }));
  elements.get('product-form').elements = { namedItem: (name) => fields.get(name) || null };
  elements.get('product-form').querySelectorAll = () => [...fields.values()];
  const requests = [];
  const context = vm.createContext({
    Intl, URLSearchParams,
    document: {
      querySelector: (selector) => elements.get(selector.slice(1)) || null,
      createElement: () => new Element(),
      createDocumentFragment: () => new Element(),
    },
    Image: Element,
    Option: class extends Element {
      constructor(text, value) { super(); this.textContent = text; this.value = value; }
    },
    setTimeout: () => 1,
    clearTimeout() {},
    sessionReady: Promise.resolve(role ? { user: { id: 1, name: 'Usuário', role } } : null),
    authFetch: async (url) => {
      requests.push(url);
      let data;
      let status = 200;
      if (url === '/api/summary') data = { total: 2, ativos: 2, com_imagem: 2 };
      else if (url === '/api/categories') data = { items: [{ nome: 'Higiene', total: 2 }] };
      else if (url.startsWith('/api/products?')) {
        const error = productsError();
        status = error ? 503 : 200;
        data = error ? { error } : {
          items: empty ? [] : [{ id: 1, nome: 'Produto de exemplo', status: 'ativo', possui_imagem_local: true, imagem_local_url: '/assets/imagens/exemplo.png' }],
          pagination: { page: 1, pageSize: 48, total: empty ? 0 : 49, totalPages: empty ? 1 : 2 },
        };
      } else throw new Error(`Requisição inesperada: ${url}`);
      return { status, ok: status < 400, json: async () => data };
    },
  });
  await vm.runInContext(script.replace(/^import .*?;\s*/m, ''), context, { filename: 'app.js' });
  return { elements, fields, requests, context };
}

test('opening the real catalogue page loads products without referencing removed summary counters', async () => {
  const { elements, requests } = await openCatalogue();
  assert.equal(elements.has('summary-total'), false);
  assert.equal(elements.get('toast').hidden, true);
  assert.equal(requests.includes('/api/summary'), false);
  assert.equal(elements.get('product-grid').hidden, false);
  assert.equal(elements.get('product-grid').children.length, 1);
  assert.equal(elements.get('page-indicator').textContent, '1 / 2');
  assert.equal(elements.get('previous-page-button').disabled, true);
  assert.equal(elements.get('next-page-button').disabled, false);
  assert.equal(elements.get('category-filter').children.length, 2);
});

test('a catalogue API failure keeps its original error message and allows the list to recover', async () => {
  let failure = 'Serviço temporariamente indisponível.';
  const { elements, context } = await openCatalogue({ productsError: () => failure });
  assert.equal(elements.has('empty-state'), false);
  assert.equal(elements.get('toast').textContent, failure);
  assert.equal(elements.get('toast').classList.contains('error'), true);
  assert.equal(elements.get('results-title').textContent, 'Tente novamente');
  assert.equal(elements.get('product-grid').hidden, true);
  failure = null;
  await context.loadProducts();
  assert.equal(elements.get('product-grid').hidden, false);
  assert.equal(elements.get('product-grid').children.length, 1);
  assert.equal(elements.get('results-title').textContent, '49 produtos');
});

test('an empty catalogue updates pagination without showing an error toast', async () => {
  const { elements } = await openCatalogue({ empty: true });
  assert.equal(elements.get('toast').hidden, true);
  assert.equal(elements.get('results-kicker').textContent, 'Nenhum resultado');
  assert.equal(elements.get('product-grid').hidden, true);
  assert.equal(elements.get('next-page-button').disabled, true);
});

test('customer catalogue keeps fields read-only and rejects every mutation handler', async () => {
  const { elements, fields, requests, context } = await openCatalogue({ role: 'cliente' });
  assert.equal(elements.get('new-product-button').disabled, true);
  assert.equal(elements.get('save-product-button').disabled, true);
  assert.equal(elements.get('delete-product-button').disabled, true);
  assert.equal(elements.get('image-upload').disabled, true);
  assert.equal(fields.get('nome').readOnly, true);
  assert.equal(fields.get('status').disabled, true);
  assert.equal(fields.get('produto_destaque').disabled, true);
  assert.equal(elements.get('cancel-dialog-button').textContent, 'Fechar');
  assert.equal(elements.get('product-grid').children.length, 1);
  const count = requests.length;
  await context.saveProduct({ preventDefault() {} });
  await context.deleteCurrentProduct();
  await assert.rejects(context.uploadProductImage(1, {}), /apenas consulta/);
  context.openDialog();
  assert.equal(requests.length, count);
});

test('catalogue does not load data or enable mutations without a verified session', async () => {
  const { elements, requests } = await openCatalogue({ role: null });
  assert.equal(requests.length, 0);
  assert.equal(elements.get('product-grid').children.length, 0);
  assert.equal(elements.get('results-kicker').textContent, 'Acesso não confirmado');
  for (const id of ['new-product-button', 'save-product-button', 'delete-product-button']) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*\\bdisabled`));
    assert.match(markup, new RegExp(`class="[^"]*admin-only[^"]*" id="${id}"`));
  }
});
