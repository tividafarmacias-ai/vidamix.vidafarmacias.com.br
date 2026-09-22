import assert from 'node:assert/strict';
import test from 'node:test';
import { initStoriesMobileEditor } from '../public/js/features/stories/mobile-editor.js';

class EventHost {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, details = {}) {
    const event = { target: this, defaultPrevented: false, ...details,
      preventDefault() { this.defaultPrevented = true; } };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
}

class Element extends EventHost {
  constructor(doc, tagName = 'section', id = '') {
    super();
    this.ownerDocument = doc;
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.textContent = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        if (force) classes.add(name); else classes.delete(name);
        return force;
      },
    };
    const properties = new Map();
    this.style = {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
      getPropertyValue: (name) => properties.get(name) || '',
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...elements) {
    for (const element of elements) {
      element.parentNode?.removeChild(element);
      this.children.push(element);
      element.parentNode = this;
    }
  }
  removeChild(element) {
    this.children.splice(this.children.indexOf(element), 1);
    element.parentNode = null;
  }
  insertBefore(element, next) {
    element.parentNode?.removeChild(element);
    this.children.splice(this.children.indexOf(next), 0, element);
    element.parentNode = this;
  }
  replaceChild(element, previous) {
    element.parentNode?.removeChild(element);
    this.children[this.children.indexOf(previous)] = element;
    previous.parentNode = null;
    element.parentNode = this;
  }
  contains(element) { return this === element || this.children.some((child) => child.contains(element)); }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const className = selector.match(/^\.([\w-]+)/)?.[1];
    if (className && !this.classList.contains(className)) return false;
    const attribute = selector.match(/\[([\w-]+)(?:="([^"]+)")?\]/);
    if (attribute) {
      const [, name, expected] = attribute;
      const value = name.startsWith('data-')
        ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]
        : this.getAttribute(name);
      return expected === undefined ? value != null : value === expected;
    }
    return Boolean(className);
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  focus() {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.dispatch('focusin', { target: this });
  }
  blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.ownerDocument.dispatch('focusout', { target: this });
  }
  click() { if (!this.disabled) this.dispatch('click'); }
}

function createFixture(isMobile = true) {
  const doc = new EventHost();
  const view = new EventHost();
  const media = new EventHost();
  const viewport = new EventHost();
  const frames = new Map();
  let frameId = 0;
  Object.assign(viewport, { height: 800, offsetTop: 0, scale: 1 });
  Object.assign(view, {
    innerHeight: 800, innerWidth: isMobile ? 390 : 1280, visualViewport: viewport,
    matchMedia: () => media,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  media.matches = isMobile;
  doc.defaultView = view;
  doc.body = new Element(doc, 'body');
  doc.activeElement = doc.body;
  doc.documentElement = { clientHeight: 800, clientWidth: view.innerWidth };
  doc.querySelector = (selector) => doc.body.querySelector(selector);
  doc.querySelectorAll = (selector) => doc.body.querySelectorAll(selector);
  doc.createComment = () => new Element(doc, '#comment');
  const add = (id, parent = doc.body, tag = 'section') => {
    const element = new Element(doc, tag, id);
    parent.append(element);
    return element;
  };
  const sidebar = add('desktop-sidebar');
  const actions = add('desktop-actions');
  const sheet = add('story-mobile-sheet');
  const nav = add('story-mobile-nav');
  const scrollport = add('mobile-panels-scrollport', sheet);
  scrollport.classList.add('story-mobile-panels');
  const backLink = add('desktop-back-link', doc.body, 'a');
  backLink.classList.add('stories-back-link');
  const previewBar = add('mobile-preview-bar');
  previewBar.classList.add('story-mobile-only');
  const panels = {};
  const tabs = {};
  const controls = {};
  for (const name of ['background', 'products', 'offer', 'adjust', 'export']) {
    controls[name] = add(`control-${name}`, name === 'export' ? actions : sidebar);
    controls[name].dataset.mobileGroup = name;
    panels[name] = add(`story-mobile-panel-${name}`, scrollport);
    tabs[name] = add(`tab-${name}`, nav, 'button');
    tabs[name].dataset.mobileStep = name;
  }
  const toggle = add('story-background-toggle', controls.background, 'button');
  toggle.classList.add('story-section-collapse-toggle');
  toggle.setAttribute('aria-expanded', 'false');
  const backgroundContent = add('story-background-content', controls.background);
  backgroundContent.hidden = true;
  toggle.addEventListener('click', () => {
    backgroundContent.hidden = !backgroundContent.hidden;
    toggle.setAttribute('aria-expanded', String(!backgroundContent.hidden));
  });
  const input = add('story-price', controls.offer, 'input');
  input.type = 'text';
  input.value = '29,90';
  const dependentControl = add('second-product-price', controls.offer, 'input');
  dependentControl.hidden = true;
  const nodes = {};
  for (const name of ['step-title', 'step-count', 'next', 'back', 'preview-toggle', 'preview-edit', 'done', 'status']) {
    nodes[name] = add(`story-mobile-${name}`, ['preview-toggle', 'preview-edit'].includes(name) ? previewBar : sheet, 'button');
  }
  const sourceStatus = add('story-status');
  sourceStatus.textContent = 'Informe o preço para finalizar a arte.';
  const progress = { background: true, products: false, offer: false, ready: false, exporting: false };
  const changes = [];
  const initialize = () => initStoriesMobileEditor({ root: doc, getProgress: () => progress,
    onStepChange: (step) => changes.push(step) });
  const resize = (mobile) => {
    media.matches = mobile;
    view.innerWidth = mobile ? 390 : 1280;
    media.dispatch('change');
  };
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  return { doc, view, viewport, media, sidebar, actions, sheet, nav, controls, panels, tabs, nodes, scrollport, backLink,
    toggle, backgroundContent, input, dependentControl, sourceStatus, progress, changes, initialize, resize, flush };
}

test('mobile shares the original inputs and restores exact desktop order on resize and destruction', () => {
  const f = createFixture();
  const originalOrder = [...f.sidebar.children];
  let changes = 0;
  f.input.addEventListener('input', () => { changes += 1; });
  const editor = f.initialize();
  assert.equal(f.controls.offer.parentNode, f.panels.offer);
  assert.equal(f.doc.querySelector('#story-price'), f.input);
  assert.equal(f.dependentControl.hidden, true);
  f.input.value = '37,50';
  f.input.dispatch('input');
  assert.equal(changes, 1);
  f.resize(false);
  assert.deepEqual(f.sidebar.children, originalOrder);
  assert.equal(f.controls.export.parentNode, f.actions);
  assert.equal(f.input.value, '37,50');
  assert.equal(f.sheet.hidden, true);
  f.resize(true);
  assert.equal(f.controls.offer.parentNode, f.panels.offer);
  editor.destroy();
  assert.deepEqual(f.sidebar.children, originalOrder);
  assert.equal(f.doc.body.classList.contains('is-mobile-editor'), false);
  f.resize(true);
  assert.equal(f.controls.offer.parentNode, f.sidebar, 'destroy removes the media listener');
});

test('desktop stays in place and a focused field remains visible when entering mobile', () => {
  const f = createFixture(false);
  const editor = f.initialize();
  assert.equal(f.controls.offer.parentNode, f.sidebar);
  assert.equal(f.nav.hidden, true);
  f.input.focus();
  f.resize(true);
  assert.equal(f.doc.body.dataset.mobileStep, 'offer');
  assert.equal(f.panels.offer.hidden, false);
  assert.equal(f.doc.activeElement, f.input);
  f.resize(false);
  assert.equal(f.doc.activeElement, f.input);
  assert.equal(f.doc.body.dataset.mobileStep, undefined);
  editor.destroy();
});

test('leaving mobile restores visible desktop focus from navigation and mobile-only tools', () => {
  const f = createFixture();
  const editor = f.initialize();
  for (const control of [f.tabs.products, f.nodes.next, f.nodes['preview-toggle']]) {
    control.focus();
    f.resize(false);
    assert.equal(f.doc.activeElement, f.backLink, control.id);
    f.resize(true);
  }
  f.tabs.offer.click();
  f.input.focus();
  f.resize(false);
  assert.equal(f.doc.activeElement, f.input, 'original fields retain their focus');
  editor.destroy();
});

test('changing steps resets the shared panel scrollport without resetting the current step on sync', () => {
  const f = createFixture();
  const editor = f.initialize();
  f.tabs.adjust.click();
  f.scrollport.scrollTop = 520;
  editor.sync();
  assert.equal(f.scrollport.scrollTop, 520);
  f.tabs.adjust.click();
  assert.equal(f.scrollport.scrollTop, 520);
  f.tabs.background.click();
  assert.equal(f.scrollport.scrollTop, 0);
  editor.destroy();
});

test('tabs support arrow keys, Home and End with a single selected tab and focused next panels', () => {
  const f = createFixture();
  const editor = f.initialize();
  assert.equal(f.nav.getAttribute('role'), 'tablist');
  assert.equal(f.nodes['step-count'].textContent, 'Etapa 1 de 5');
  assert.equal(f.nodes.back.disabled, true);
  const event = f.tabs.background.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.doc.activeElement, f.tabs.products);
  assert.equal(f.tabs.products.getAttribute('aria-selected'), 'true');
  assert.equal(f.tabs.background.tabIndex, -1);
  assert.equal(f.panels.background.hidden, true);
  assert.equal(f.panels.products.hidden, false);
  f.nodes.next.click();
  assert.equal(f.doc.activeElement, f.panels.offer);
  f.tabs.offer.dispatch('keydown', { key: 'End' });
  assert.equal(f.doc.activeElement, f.tabs.export);
  assert.equal(f.nodes.next.hidden, true);
  f.tabs.export.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(f.doc.activeElement, f.tabs.background);
  f.tabs.background.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(f.doc.activeElement, f.tabs.export);
  f.tabs.export.dispatch('keydown', { key: 'Home' });
  assert.equal(f.doc.activeElement, f.tabs.background);
  editor.destroy();
});

test('a tablist wrapper keeps the navigation landmark intact', () => {
  const f = createFixture();
  const tablist = new Element(f.doc, 'div');
  tablist.setAttribute('role', 'tablist');
  tablist.append(...Object.values(f.tabs));
  f.nav.append(tablist);
  const editor = f.initialize();
  assert.equal(f.nav.getAttribute('role'), null);
  assert.equal(f.nav.querySelectorAll('[role="tablist"]').length, 1);
  f.tabs.offer.click();
  assert.equal(f.panels.offer.hidden, false);
  editor.destroy();
});

test('returning to a step opens its existing accordion, while sync preserves editor-owned hidden state', () => {
  const f = createFixture();
  const editor = f.initialize();
  assert.equal(f.backgroundContent.hidden, false);
  f.toggle.click();
  editor.sync();
  assert.equal(f.backgroundContent.hidden, true);
  assert.equal(f.dependentControl.hidden, true);
  f.tabs.products.click();
  f.tabs.background.click();
  assert.equal(f.backgroundContent.hidden, false);
  assert.equal(editor.showStep('unknown'), false);
  editor.destroy();
});

test('expanded preview retains navigation and returns to editable panels through tabs or Escape', () => {
  const f = createFixture();
  const editor = f.initialize();
  f.nodes['preview-toggle'].click();
  assert.equal(f.sheet.hidden, true);
  assert.equal(f.nav.hidden, false);
  assert.equal(f.nodes['preview-toggle'].getAttribute('aria-pressed'), 'true');
  f.tabs.offer.click();
  assert.equal(f.sheet.hidden, false);
  assert.equal(f.panels.offer.hidden, false);
  assert.equal(f.doc.body.classList.contains('story-mobile-preview-expanded'), false);
  f.nodes['preview-toggle'].click();
  f.doc.dispatch('keydown', { key: 'Escape' });
  assert.equal(f.doc.activeElement, f.nodes['preview-toggle']);
  assert.equal(f.sheet.hidden, false);
  f.nodes['preview-edit'].click();
  assert.equal(f.doc.activeElement, f.panels.adjust);
  editor.destroy();
});

test('changing steps and expanding the preview dismiss the keyboard for hidden input fields', () => {
  const f = createFixture();
  const editor = f.initialize();
  f.tabs.offer.click();
  f.input.focus();
  f.tabs.products.click();
  assert.equal(f.doc.activeElement, f.doc.body);
  f.tabs.offer.click();
  f.input.focus();
  f.nodes['preview-toggle'].click();
  assert.equal(f.doc.activeElement, f.doc.body);
  assert.equal(f.nodes['preview-toggle'].textContent, 'Voltar aos controles');
  f.nodes['preview-toggle'].click();
  assert.equal(f.nodes['preview-toggle'].textContent, 'Ampliar prévia');
  editor.destroy();
});

test('progress and errors follow the editor without preventing navigation through unfinished steps', () => {
  const f = createFixture();
  const editor = f.initialize();
  assert.equal(f.tabs.background.classList.contains('is-complete'), true);
  assert.equal(f.tabs.products.classList.contains('is-complete'), false);
  assert.equal(f.nodes.status.textContent, f.sourceStatus.textContent);
  f.tabs.products.click();
  f.nodes.next.click();
  assert.equal(f.panels.offer.hidden, false);
  Object.assign(f.progress, { products: true, offer: true, ready: true, exporting: true });
  f.sourceStatus.classList.add('is-error');
  f.sourceStatus.textContent = 'Falha ao carregar a imagem.';
  editor.sync();
  assert.equal(f.nodes.status.textContent, 'Falha ao carregar a imagem.');
  assert.equal(f.nodes.status.classList.contains('is-error'), true);
  assert.equal(f.tabs.products.classList.contains('is-complete'), true);
  assert.equal(f.tabs.export.classList.contains('is-ready'), true);
  assert.equal(f.nav.getAttribute('aria-busy'), 'true');
  editor.destroy();
});

test('visual viewport tracks keyboard, scrolling, zoom and desktop cleanup', () => {
  const f = createFixture();
  const editor = f.initialize();
  f.tabs.offer.click();
  f.input.focus();
  f.viewport.height = 470;
  f.viewport.offsetTop = 28;
  f.viewport.dispatch('resize');
  f.flush();
  assert.equal(f.doc.body.classList.contains('story-mobile-keyboard-open'), true);
  assert.equal(f.doc.body.style.getPropertyValue('--story-viewport-height'), '470px');
  assert.equal(f.doc.body.style.getPropertyValue('--story-viewport-top'), '28px');
  assert.equal(f.nodes.done.hidden, false);
  f.viewport.scale = 1.5;
  f.viewport.dispatch('resize');
  f.flush();
  assert.equal(f.doc.body.classList.contains('story-mobile-keyboard-open'), false, 'pinch zoom is not a keyboard');
  f.viewport.scale = 1;
  f.viewport.dispatch('resize');
  f.flush();
  f.nodes.done.click();
  f.flush();
  assert.equal(f.doc.activeElement, f.doc.body);
  assert.equal(f.doc.body.classList.contains('story-mobile-keyboard-open'), false);
  f.resize(false);
  assert.equal(f.doc.body.style.getPropertyValue('--story-viewport-height'), '');
  assert.equal(f.doc.body.style.getPropertyValue('--story-viewport-top'), '');
  editor.destroy();
});

test('keyboard detection also handles browsers which shrink innerHeight without VisualViewport', () => {
  const f = createFixture();
  f.view.visualViewport = null;
  const editor = f.initialize();
  f.input.focus();
  f.view.innerHeight = 470;
  f.doc.documentElement.clientHeight = 470;
  f.view.dispatch('resize');
  f.flush();
  assert.equal(f.doc.body.classList.contains('story-mobile-keyboard-open'), true);
  f.view.innerWidth = 800;
  f.view.innerHeight = 390;
  f.doc.documentElement.clientHeight = 390;
  f.view.dispatch('orientationchange');
  f.flush();
  assert.equal(f.doc.body.classList.contains('story-mobile-keyboard-open'), false, 'rotation resets the height baseline');
  editor.destroy();
});

test('tour reveal selects the hidden target panel and expands its accordion without stealing focus', () => {
  const f = createFixture();
  const editor = f.initialize();
  f.tabs.offer.click();
  f.toggle.click();
  f.nodes['preview-toggle'].focus();
  f.doc.dispatch('story:reveal-target', { detail: { target: f.backgroundContent } });
  assert.equal(f.panels.background.hidden, false);
  assert.equal(f.backgroundContent.hidden, false);
  assert.equal(f.doc.activeElement, f.nodes['preview-toggle']);
  f.doc.dispatch('story:reveal-target', { detail: { target: f.controls.export } });
  assert.equal(f.panels.export.hidden, false);
  f.doc.dispatch('story:tour-end');
  assert.equal(f.panels.offer.hidden, false);
  assert.equal(f.doc.activeElement, f.nodes['preview-toggle']);
  editor.destroy();
});

test('closing a tour restores an expanded preview and clears the tour snapshot', () => {
  const f = createFixture();
  const editor = f.initialize();
  f.tabs.adjust.click();
  f.nodes['preview-toggle'].click();
  f.doc.dispatch('story:reveal-target', { detail: { target: f.controls.background } });
  assert.equal(f.sheet.hidden, false);
  f.doc.dispatch('story:tour-end');
  assert.equal(f.doc.body.dataset.mobileStep, 'adjust');
  assert.equal(f.sheet.hidden, true);
  f.tabs.offer.click();
  f.doc.dispatch('story:tour-end');
  assert.equal(f.doc.body.dataset.mobileStep, 'offer');
  editor.destroy();
});
