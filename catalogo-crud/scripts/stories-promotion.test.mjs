import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createStoriesEditorState } from '../public/js/features/stories/state.js';

const source = await readFile(new URL('../public/js/features/stories/editor.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}

function fixture(mode = 'single') {
  const state = { ...createStoriesEditorState(), compositionMode: mode, price: '19,90', secondaryPrice: '29,90' };
  const calls = [];
  const context = {
    font: '20px Arial', save() {}, restore() {}, fill() {},
    fillText(text, x, y) { calls.push({ text, x, y }); },
    fillRect(x, y, width, height) { calls.push({ strike: true, x, y, width, height }); },
    measureText(text) { return { width: text.length * parseFloat(this.font.match(/[\d.]+px/)[0]) * .55 }; },
  };
  const sandbox = vm.createContext({
    state, context, STORY_WIDTH: 1080, MIN_DETAILS_WIDTH: 176, DESCRIPTION_CARD_PADDING: 20,
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    isTwoProductsMode: () => state.compositionMode === 'two-products',
    hasPrice: () => true,
    getPriceForDetailsTarget: target => target === 'details-secondary' ? state.secondaryPrice : state.price,
    getDetailsTransform: () => ({ x: 100, y: 100, width: 480 }),
    getDetailsMeasureContext: () => context,
    getDetailsTextMetrics: () => ({ titleLines: ['Produto'], titleWidth: 140, supportingLines: ['Descrição'], supportingWidth: 160 }),
    drawRoundedRect() {},
  });
  vm.runInContext(['getOriginalPrice', 'getDetailsPriceMetrics', 'getDetailsLayout', 'drawDetailsCard'].map(extract).join('\n'), sandbox);
  return { state, calls, sandbox, draw(target = 'details') {
    calls.length = 0;
    sandbox.target = target;
    vm.runInContext("drawDetailsCard(context, { nome: 'Produto' }, getPriceForDetailsTarget(target), target)", sandbox);
    return calls;
  } };
}

test('optional promotion changes rendering and measured bounds only while enabled and filled', () => {
  const f = fixture();
  const initial = f.sandbox.getDetailsLayout();
  f.state.originalPrice = '29,90';
  assert.ok(!f.draw().some(call => call.text?.startsWith('De ')));
  f.state.useOriginalPrice = true;
  const promoted = f.sandbox.getDetailsLayout();
  assert.ok(Math.abs(promoted.cardHeight - initial.cardHeight - promoted.originalPriceHeight) < 1e-8);
  const calls = f.draw();
  const normal = calls.find(call => call.text === 'De R$ 29,90');
  assert.ok(normal);
  assert.ok(calls.some(call => call.text === 'Por R$'));
  assert.ok(calls.some(call => call.strike && call.y === normal.y));
  assert.ok(normal.y < calls.find(call => call.text === '19,90').y);
  f.state.useOriginalPrice = false;
  assert.equal(f.sandbox.getDetailsLayout().cardHeight, initial.cardHeight);
  assert.ok(!f.draw().some(call => call.text === 'Por R$'));
  f.state.useOriginalPrice = true;
  f.state.originalPrice = '';
  assert.equal(f.sandbox.getDetailsLayout().cardHeight, initial.cardHeight);
});

test('switch reveals optional original fields and adapts the secondary field to composition', () => {
  const f = fixture();
  const elements = Object.fromEntries(['useOriginalPrice', 'originalPriceFields', 'originalPrice',
    'secondaryOriginalPriceField', 'secondaryOriginalPrice', 'originalPriceLabel', 'primaryPriceLabel',
    'secondaryPriceField', 'price', 'secondaryPrice', 'secondaryPriceLabel'].map(key => [key, {
    value: '', classList: { toggle() {} }, setAttribute() {},
  }]));
  Object.assign(f.sandbox, { elements, syncPriceValidation() {}, isComboMode: () => f.state.compositionMode === 'combo' });
  vm.runInContext(extract('syncPriceInputs'), f.sandbox);
  f.sandbox.syncPriceInputs();
  assert.equal(elements.originalPriceFields.hidden, true);
  assert.equal(elements.originalPrice.disabled, true);
  f.state.useOriginalPrice = true;
  f.sandbox.syncPriceInputs();
  assert.equal(elements.originalPriceFields.hidden, false);
  assert.equal(elements.originalPrice.disabled, false);
  assert.equal(elements.secondaryOriginalPriceField.hidden, true);
  assert.match(elements.primaryPriceLabel.textContent, /^Por/);
  f.state.compositionMode = 'two-products';
  f.sandbox.syncPriceInputs();
  assert.equal(elements.secondaryOriginalPriceField.hidden, false);
  assert.equal(elements.secondaryOriginalPrice.disabled, false);
  f.state.originalPrice = '39,90';
  f.state.useOriginalPrice = false;
  f.sandbox.syncPriceInputs();
  assert.equal(elements.originalPriceFields.hidden, true);
  assert.equal(elements.originalPrice.value, '39,90', 'disabling preserves the value for reuse');
  assert.match(elements.primaryPriceLabel.textContent, /^Preço/);
});

test('two products keep independent original prices and combo has one shared offer', () => {
  const f = fixture('two-products');
  Object.assign(f.state, { useOriginalPrice: true, originalPrice: '39,90', secondaryOriginalPrice: '49,90' });
  assert.ok(f.draw().some(call => call.text === 'De R$ 39,90'));
  assert.ok(f.draw('details-secondary').some(call => call.text === 'De R$ 49,90'));
  f.state.compositionMode = 'combo';
  assert.ok(!f.draw('details-secondary').some(call => call.text?.startsWith('De ')));
  assert.ok(f.draw().some(call => call.text === 'De R$ 39,90'));
});
