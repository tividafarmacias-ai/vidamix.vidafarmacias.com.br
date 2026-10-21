import assert from 'node:assert/strict';
import test from 'node:test';
import { getAppScreen, hasSoftwareKeyboard, initAppShell, initNavigationFeedback } from '../public/js/app-shell.js';

class EventHost {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
}

function element() {
  const classes = new Set();
  const properties = new Map();
  const attributes = new Map();
  return Object.assign(new EventHost(), {
    children: [], dataset: {},
    classList: {
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
    },
    style: {
      setProperty(name, value) { properties.set(name, value); },
      getPropertyValue(name) { return properties.get(name); },
    },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    append(...children) { this.children.push(...children); },
    matches() { return false; },
    contains(node) { return node === this || this.children.some((child) => child.contains?.(node)); },
    focus() {},
  });
}

function fixture({ pathname = '/catalogo', iosStandalone = false, visualViewport = true, withHeader = false, session = { user: { id: 1, name: 'Usuário', role: 'admin' } } } = {}) {
  const win = new EventHost();
  const doc = new EventHost();
  const viewport = visualViewport ? Object.assign(new EventHost(), { height: 844, offsetTop: 0, scale: 1 }) : null;
  const standalone = Object.assign(new EventHost(), { matches: false });
  const mobile = Object.assign(new EventHost(), { matches: true });
  const header = element();
  const inner = element();
  const brand = element();
  header.append(inner);
  inner.append(brand);
  header.querySelector = (selector) => selector === '.site-header-inner' ? inner : selector === '.site-brand' ? brand : null;
  Object.assign(win, {
    innerHeight: 844, innerWidth: 390, visualViewport: viewport,
    location: { pathname }, navigator: { standalone: iosStandalone },
    matchMedia: (query) => query.includes('display-mode') ? standalone : mobile,
    requestAnimationFrame: (callback) => callback(),
  });
  Object.assign(doc, {
    documentElement: Object.assign(element(), { clientHeight: 844, clientWidth: 390 }),
    body: element(), createElement: element, querySelector: (selector) => withHeader && selector === '[data-app-header]' ? header : null,
  });
  if (pathname === '/offline.html') doc.body.classList.add('offline-page');
  doc.activeElement = doc.body;
  const input = Object.assign(element(), { matches: () => true });
  const ready = initAppShell(win, doc, { session });
  const focus = () => { doc.activeElement = input; doc.emit('focusin'); };
  const blur = () => { doc.activeElement = doc.body; doc.emit('focusout'); };
  const keyboardOpen = () => doc.documentElement.classList.contains('app-keyboard-open');
  return { win, doc, viewport, standalone, mobile, input, header, inner, brand, ready, focus, blur, keyboardOpen };
}

test('iOS viewport panning keeps the keyboard state until input loses focus', () => {
  const f = fixture();
  f.focus();
  f.viewport.height = 470;
  f.viewport.offsetTop = 260;
  f.viewport.emit('resize');
  assert.equal(f.keyboardOpen(), true);
  assert.equal(f.doc.documentElement.style.getPropertyValue('--app-viewport-top'), '260px');
  f.viewport.offsetTop = 300;
  f.viewport.emit('scroll');
  assert.equal(f.keyboardOpen(), true);
  f.blur();
  assert.equal(f.keyboardOpen(), false);
});

test('Android resize retains the height before editing, with or without VisualViewport', () => {
  for (const visualViewport of [true, false]) {
    const f = fixture({ visualViewport });
    f.focus();
    f.win.innerHeight = f.doc.documentElement.clientHeight = 470;
    if (f.viewport) f.viewport.height = 470;
    f.win.emit('resize');
    assert.equal(f.keyboardOpen(), true);
    f.win.innerHeight = f.doc.documentElement.clientHeight = 844;
    if (f.viewport) f.viewport.height = 844;
    f.win.emit('resize');
    assert.equal(f.keyboardOpen(), false, 'closing the keyboard works even with input still focused');
  }
});

test('rotation resets the height baseline, then portrait keyboard detection still works', () => {
  const f = fixture();
  f.focus();
  f.win.innerWidth = 844;
  f.win.innerHeight = f.doc.documentElement.clientHeight = f.viewport.height = 390;
  f.win.emit('orientationchange');
  assert.equal(f.keyboardOpen(), false, 'a shorter landscape screen is not a keyboard');
  f.win.innerWidth = 390;
  f.win.innerHeight = f.doc.documentElement.clientHeight = f.viewport.height = 844;
  f.win.emit('resize');
  assert.equal(f.keyboardOpen(), false);
  f.viewport.height = 470;
  f.viewport.emit('resize');
  assert.equal(f.keyboardOpen(), true);
});

test('pinch zoom, readonly controls and desktop resizing do not hide navigation', () => {
  const f = fixture();
  f.focus();
  f.viewport.height = 400;
  for (const scale of [1.5, 0.8]) {
    f.viewport.scale = scale;
    f.viewport.emit('resize');
    assert.equal(f.keyboardOpen(), false);
  }
  f.viewport.scale = 1;
  f.input.readOnly = true;
  f.viewport.emit('resize');
  assert.equal(f.keyboardOpen(), false);
  f.input.readOnly = false;
  f.mobile.matches = false;
  f.mobile.emit('change');
  assert.equal(f.keyboardOpen(), false);
  assert.equal(hasSoftwareKeyboard({ editable: false, layoutHeight: 844, visibleHeight: 400 }), false);
});

test('browsing navigation resolves route aliases, while editors keep their own navigation', async () => {
  const expected = new Map([
    ['/', 'home'], ['/index.html', 'home'], ['/catalogo/', 'catalogue'], ['/catalogo.html', 'catalogue'],
    ['/revista', 'revista'], ['/revista.html', 'revista'], ['/backgrounds/', 'backgrounds'], ['/backgrounds.html', 'backgrounds'],
    ['/artes/stories', 'stories'], ['/stories.html', 'stories'], ['/artes/feed/', 'feed'], ['/feed.html', 'feed'],
    ['/artes/indoor-h', 'indoor'], ['/indoor-h.html', 'indoor'], ['/missing', null],
  ]);
  for (const [path, screen] of expected) assert.equal(getAppScreen(path), screen);
  const catalogue = fixture();
  await catalogue.ready;
  const nav = catalogue.doc.body.children[0];
  assert.equal(nav.children.length, 5);
  assert.equal(nav.children.find(link => link.href === '/revista').href, '/revista');
  assert.equal(nav.children.some((link) => link.href.includes('indoor')), false);
  assert.equal(nav.children.filter((link) => link.getAttribute('aria-current') === 'page').length, 1);
  assert.equal(nav.children[1].href, '/catalogo');
  for (const pathname of ['/artes/stories', '/artes/feed', '/artes/indoor-h']) {
    const editor = fixture({ pathname });
    await editor.ready;
    assert.equal(editor.doc.body.children.length, 0);
    assert.equal(editor.doc.body.classList.contains('has-app-tabbar'), false);
  }
});

test('customer navigation waits for the session, includes TV Indoor and omits administrative destinations', async () => {
  let resolveSession;
  const session = new Promise((resolve) => { resolveSession = resolve; });
  const f = fixture({ withHeader: true, session });
  assert.equal(f.inner.children.length, 1, 'no private navigation while access is unknown');
  assert.equal(f.doc.body.children.length, 0);
  resolveSession({ user: { id: 9, name: '<Conta cliente>', role: 'cliente' } });
  await f.ready;
  const nav = f.inner.children.find(({ className }) => className === 'site-nav');
  assert.deepEqual(nav.children.filter(({ href }) => href).map(({ href }) => href), ['/', '/catalogo', '/artes/stories', '/artes/feed', '/artes/indoor-h']);
  assert.equal(nav.children.find(({ className }) => className === 'site-account').textContent, '<Conta cliente> · Cliente');
  assert.equal(f.inner.children.find(({ className }) => className === 'site-logout').textContent, 'Sair');
  assert.equal(f.brand.href, '/');
  assert.equal(nav.hidden, true, 'mobile menu starts collapsed');
  const toggle = f.inner.children.find(({ className }) => className === 'site-menu-toggle');
  toggle.emit('click');
  assert.equal(nav.hidden, false);
  f.doc.emit('keydown', { key: 'Escape' });
  assert.equal(nav.hidden, true);
  const tabs = f.doc.body.children.find(({ className }) => className === 'app-tabbar');
  assert.equal(tabs.children.length, 5);
  assert.equal(tabs.children.at(-1).href, '/artes/indoor-h');
  assert.equal(tabs.children[0].href, '/');
});

test('failed sessions and offline screens show only the login destination', async () => {
  for (const pathname of ['/catalogo', '/offline.html']) {
    const f = fixture({ pathname, withHeader: true, session: null });
    await f.ready;
    const nav = f.inner.children.find(({ className }) => className === 'site-nav');
    assert.deepEqual(nav.children.filter(({ href }) => href).map(({ href }) => href), ['/login']);
    assert.equal(f.doc.body.classList.contains('has-app-tabbar'), false);
    assert.equal(f.brand.href, '/login');
    const error = f.doc.body.children.find(({ className }) => className === 'app-session-error');
    assert.equal(Boolean(error), pathname !== '/offline.html');
  }
});

test('standalone detection supports both installed iOS and display-mode changes', () => {
  const ios = fixture({ iosStandalone: true });
  assert.equal(ios.doc.documentElement.classList.contains('is-standalone'), true);
  const browser = fixture();
  assert.equal(browser.doc.documentElement.classList.contains('is-standalone'), false);
  browser.standalone.matches = true;
  browser.standalone.emit('change');
  assert.equal(browser.doc.documentElement.classList.contains('is-standalone'), true);
});

test('navigation feedback handles links, cancellation, new tabs, back/forward and recovery timeout', async () => {
  const win = new EventHost();
  const doc = new EventHost();
  const timers = new Map();
  Object.assign(win, {
    location: new URL('https://vidamix.test/catalogo'),
    setTimeout: (callback) => { timers.set(1, callback); return 1; },
    clearTimeout: (id) => timers.delete(id),
  });
  Object.assign(doc, { body: element(), createElement: element, readyState: 'complete' });
  initNavigationFeedback(win, doc);
  const click = async (href, overrides = {}, linkOverrides = {}) => {
    const link = { href, target: '', hasAttribute: () => false, ...linkOverrides };
    doc.emit('click', { button: 0, target: { closest: () => link }, ...overrides });
    await Promise.resolve();
  };
  for (const href of ['#products', '/catalogo', 'https://external.test/', '/assets/imagens/a.png']) await click(href);
  await click('/artes/stories', { ctrlKey: true });
  await click('/artes/stories', { defaultPrevented: true });
  await click('/artes/stories', {}, { target: '_blank' });
  await click('/artes/stories', {}, { hasAttribute: () => true });
  assert.equal(doc.body.children.length, 0);
  await click('/artes/stories?productId=42');
  const indicator = doc.body.children[0];
  assert.equal(indicator.hidden, false);
  assert.equal(indicator.getAttribute('role'), 'status');
  win.emit('pageshow');
  assert.equal(indicator.hidden, true);
  await click('/artes/feed');
  timers.get(1)();
  assert.equal(indicator.hidden, true);
  assert.equal(doc.body.children.length, 1);
  await click('/');
  win.emit('pagehide');
  assert.equal(indicator.hidden, true);
});
