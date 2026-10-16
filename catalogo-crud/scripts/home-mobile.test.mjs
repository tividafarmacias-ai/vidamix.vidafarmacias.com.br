import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [markup, script] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/home.js', import.meta.url), 'utf8'),
]);

class Element {
  constructor(document) {
    this.ownerDocument = document;
    this.listeners = new Map();
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    };
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type, details = {}) {
    const event = { target: this, defaultPrevented: false, ...details,
      preventDefault() { this.defaultPrevented = true; } };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { assert.equal(this.hidden, false); this.open = true; }
  close() { this.open = false; }
}

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
const validEan = '7894900011517';
const otherEan = '7891000053508';
const response = (body = { id: 42 }, status = 200) => ({ ok: status < 400, json: async () => body });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function openHome({ touch = true, lookup = async () => response() } = {}) {
  const document = {};
  document.body = new Element(document);
  const elements = new Map([...markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => {
    const node = new Element(document);
    node.hidden = /\bhidden(?:\s|[=>])/.test(tag);
    node.disabled = /\bdisabled(?:\s|[=>])/.test(tag);
    return [id, node];
  }));
  document.querySelector = (selector) => elements.get(selector.slice(1)) ?? null;
  const requests = [];
  const destinations = [];
  const timers = new Map();
  const frames = [];
  let timerId = 0;
  const sandbox = vm.createContext({
    document, AbortController,
    window: { matchMedia: () => ({ matches: touch }), location: { assign: (url) => destinations.push(url) } },
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback, duration) => { timers.set(++timerId, { callback, duration }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) => { requests.push({ url, ...options }); return lookup(url, options); },
  });
  vm.runInContext(script, sandbox, { filename: 'home.js' });
  const get = (id) => elements.get(`ean-${id}`);
  const show = () => { get('overlay-open').click(); frames.splice(0).forEach((callback) => callback()); };
  const input = (value) => { get('input').value = value; get('input').dispatch('input'); };
  const submit = () => get('launcher').dispatch('submit');
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach(({ callback }) => callback());
  };
  return { get, show, input, submit, runTimers, document, requests, destinations, timers };
}

test('touch scanner opens as a dialog without raising the keyboard and waits for explicit submit', async () => {
  const f = openHome();
  f.show();
  assert.equal(f.get('scanner-overlay').open, true);
  assert.equal(f.document.body.classList.contains('scanner-open'), true);
  assert.equal(f.document.activeElement, f.get('overlay-close'));
  assert.equal(f.get('submit').disabled, false);
  f.input(validEan);
  f.runTimers();
  await flush();
  assert.equal(f.requests.length, 0, 'Touch typing does not launch an artwork before confirmation');
  const event = f.submit();
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.get('submit').disabled, true);
  await flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, `/api/products/by-ean/${validEan}`);
  assert.deepEqual(f.destinations, ['/artes/stories?productId=42']);
});

test('manual submit normalizes a valid code and opens the selected Feed format', async () => {
  const f = openHome({ lookup: async () => response({ id: 'product/17' }) });
  f.show();
  f.get('format').value = 'feed';
  f.input('789 4900-011517');
  f.submit();
  await flush();
  assert.equal(f.get('input').value, validEan);
  assert.deepEqual(f.destinations, ['/artes/feed?productId=product%2F17']);
});

test('invalid or incomplete codes show validation without requesting a product', async () => {
  const f = openHome();
  f.show();
  for (const value of ['', '123', '7894900011518']) {
    f.input(value);
    f.submit();
    assert.equal(f.get('status').classList.contains('is-error'), true);
    assert.match(f.get('status').textContent, /Código não reconhecido/);
  }
  await flush();
  assert.equal(f.requests.length, 0);
  assert.equal(f.destinations.length, 0);
  assert.equal(f.get('submit').disabled, false);
});

test('desktop readers retain debounced automatic lookup and closing cancels a pending scan', async () => {
  const f = openHome({ touch: false });
  f.show();
  assert.equal(f.document.activeElement, f.get('input'));
  f.input(validEan);
  assert.equal(f.requests.length, 0);
  assert.equal([...f.timers.values()][0].duration, 120);
  f.get('overlay-close').click();
  f.runTimers();
  await flush();
  assert.equal(f.requests.length, 0);
  f.show();
  f.input(validEan);
  f.runTimers();
  await flush();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.destinations, ['/artes/stories?productId=42']);
});

test('closing cancels lookup and a late response cannot navigate or overwrite a newly opened scanner', async () => {
  const pending = deferred();
  const f = openHome({ lookup: () => pending.promise });
  f.show();
  f.input(validEan);
  f.submit();
  assert.equal(f.requests[0].signal.aborted, false);
  f.get('overlay-close').click();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.get('scanner-overlay').open, false);
  assert.equal(f.get('scanner-overlay').hidden, true);
  assert.equal(f.document.body.classList.contains('scanner-open'), false);
  assert.equal(f.document.activeElement, f.get('overlay-open'));
  f.show();
  pending.resolve(response());
  await flush();
  assert.deepEqual(f.destinations, []);
  assert.equal(f.get('input').value, '');
  assert.equal(f.get('submit').disabled, false);
  assert.equal(f.get('status').classList.contains('is-error'), false);
});

test('editing during lookup aborts the previous request and allows only the latest code to navigate', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const f = openHome({ lookup: () => (++calls === 1 ? first : second).promise });
  f.show();
  f.input(validEan);
  f.submit();
  f.input(otherEan);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.get('submit').disabled, false);
  f.submit();
  assert.equal(f.requests.length, 2);
  first.resolve(response({ error: 'Resposta antiga' }, 404));
  await flush();
  assert.equal(f.get('submit').disabled, true, 'An obsolete request cannot enable submit during the new lookup');
  assert.equal(f.get('status').classList.contains('is-error'), false);
  second.resolve(response({ id: 99 }));
  await flush();
  assert.deepEqual(f.destinations, ['/artes/stories?productId=99']);
});

test('Escape and backdrop both close the scanner while clicks inside it keep the dialog open', () => {
  const f = openHome();
  f.show();
  f.get('scanner-overlay').dispatch('click', { target: f.get('input') });
  assert.equal(f.get('scanner-overlay').open, true);
  const escape = f.get('scanner-overlay').dispatch('cancel');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.get('scanner-overlay').open, false);
  f.show();
  f.get('scanner-overlay').click();
  assert.equal(f.get('scanner-overlay').open, false);
  assert.equal(f.document.activeElement, f.get('overlay-open'));
});

test('lookup errors preserve the code, restore submit and allow retrying the same product', async () => {
  let count = 0;
  const f = openHome({ lookup: async () => ++count === 1 ? response({ error: 'Produto indisponível' }, 404) : response() });
  f.show();
  f.input(validEan);
  f.submit();
  f.submit();
  assert.equal(f.requests.length, 1, 'Duplicate submit cannot launch concurrent lookups');
  await flush();
  assert.match(f.get('status').textContent, /Produto indisponível/);
  assert.equal(f.get('input').value, validEan);
  assert.equal(f.get('submit').disabled, false);
  assert.equal(f.document.activeElement, f.get('input'));
  f.submit();
  await flush();
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.destinations, ['/artes/stories?productId=42']);
});
