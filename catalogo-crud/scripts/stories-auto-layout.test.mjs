import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoLayout } from '../public/js/features/stories/auto-layout.js';

const SAFE_AREA = { left: 56, top: 408, right: 1024, bottom: 1864 };
const GAP = 32;
const EPSILON = 0.001;

function measureCards(target, width) {
  // Mimic cards whose visible description is narrower than the editing frame.
  return {
    width: Math.max(176, width * 0.88),
    height: Math.max(116, width * (target === 'details-secondary' ? 0.46 : 0.38)),
  };
}

function inputFor(mode, aspectRatios = [1, 1], overrides = {}) {
  return {
    mode,
    products: [
      { target: 'product', aspectRatio: aspectRatios[0] },
      ...(mode === 'single' ? [] : [{ target: 'product-secondary', aspectRatio: aspectRatios[1] }]),
    ],
    measureDetails: measureCards,
    ...overrides,
  };
}

function visualBoxes(layout, input) {
  const boxes = [];
  for (const product of input.products) {
    const transform = layout.products[product.target];
    assert.ok(transform, `missing ${product.target}`);
    boxes.push({
      target: product.target,
      ...transform,
      height: transform.width / product.aspectRatio,
    });
  }
  for (const [target, transform] of Object.entries(layout.details)) {
    const measured = input.measureDetails(target, transform.width);
    boxes.push({
      target,
      x: transform.x + (transform.width - measured.width) / 2,
      y: transform.y,
      width: measured.width,
      height: measured.height,
    });
  }
  return boxes;
}

function assertSeparated(first, second) {
  assert.ok(
    first.x + first.width + GAP <= second.x + EPSILON
      || second.x + second.width + GAP <= first.x + EPSILON
      || first.y + first.height + GAP <= second.y + EPSILON
      || second.y + second.height + GAP <= first.y + EPSILON,
    `${first.target} overlaps or crowds ${second.target}: ${JSON.stringify([first, second])}`,
  );
}

function assertUsableLayout(input) {
  const layout = createAutoLayout(input);
  assert.ok(layout, `expected a usable ${input.mode} composition`);
  assert.equal(typeof layout.arrangement, 'string');
  assert.ok(layout.arrangement.length > 0);
  assert.deepEqual(Object.keys(layout.products).sort(), input.products.map(({ target }) => target).sort());
  assert.deepEqual(
    Object.keys(layout.details).sort(),
    input.mode === 'two-products' ? ['details', 'details-secondary'] : ['details'],
  );

  const boxes = visualBoxes(layout, input);
  for (const box of boxes) {
    assert.ok([box.x, box.y, box.width, box.height].every(Number.isFinite), `${box.target} has invalid geometry`);
    assert.ok(box.width > 0 && box.height > 0, `${box.target} must remain visible`);
    assert.ok(box.x >= SAFE_AREA.left - EPSILON, `${box.target} exceeds the left margin`);
    assert.ok(box.y >= SAFE_AREA.top - EPSILON, `${box.target} overlaps the brand header`);
    assert.ok(box.x + box.width <= SAFE_AREA.right + EPSILON, `${box.target} exceeds the right margin`);
    assert.ok(box.y + box.height <= SAFE_AREA.bottom + EPSILON, `${box.target} exceeds the bottom margin`);
    if (input.freeTextBox) assertSeparated(box, { target: 'free text', ...input.freeTextBox });
  }
  for (let index = 0; index < boxes.length; index += 1) {
    for (const other of boxes.slice(index + 1)) assertSeparated(boxes[index], other);
  }
  return layout;
}

for (const mode of ['single', 'two-products', 'combo']) {
  test(`${mode} preserves composition structure and safe spacing for different product shapes`, () => {
    for (const aspects of [[1, 1], [0.25, 0.3], [3.5, 4], [0.25, 3.5], [3.5, 0.25], [0.65, 1.7]]) {
      assertUsableLayout(inputFor(mode, aspects));
    }
  });

  test(`${mode} reserves existing free text without changing its position or dimensions`, () => {
    for (const freeTextBox of [
      { x: 220, y: 430, width: 640, height: 120 },
      { x: 210, y: 1690, width: 660, height: 130 },
      { x: 410, y: 1080, width: 260, height: 150 },
    ]) {
      const original = { ...freeTextBox };
      assertUsableLayout(inputFor(mode, [0.7, 1.5], { freeTextBox }));
      assert.deepEqual(freeTextBox, original);
    }
  });

  test(`${mode} measures long descriptions and larger price cards before placing them`, () => {
    const measureDetails = (target, width) => ({
      width: Math.max(184, width * (target === 'details-secondary' ? 0.96 : 0.82)),
      height: Math.max(180, width * (target === 'details-secondary' ? 0.92 : 0.66)),
    });
    assertUsableLayout(inputFor(mode, [0.8, 1.1], { measureDetails }));
  });
}

test('a single square product uses the available room at a useful display size', () => {
  const input = inputFor('single');
  const layout = assertUsableLayout(input);
  assert.ok(layout.products.product.width >= 600, 'the product should expand into the available space');
});

test('two-product measurements keep each price associated with its own card', () => {
  const measuredTargets = new Set();
  const input = inputFor('two-products', [0.6, 1.6], {
    measureDetails(target, width) {
      measuredTargets.add(target);
      return { width: width * 0.9, height: target === 'details' ? 140 : 310 };
    },
  });
  assertUsableLayout(input);
  assert.deepEqual([...measuredTargets].sort(), ['details', 'details-secondary']);
});

test('combo uses one shared price card and never measures a secondary price', () => {
  const input = inputFor('combo', [0.7, 1.4], {
    measureDetails(target, width) {
      assert.equal(target, 'details');
      return measureCards(target, width);
    },
  });
  const layout = assertUsableLayout(input);
  assert.equal(layout.details['details-secondary'], undefined);
});

test('identical inputs produce identical layouts without mutating supplied products', () => {
  const products = Object.freeze([
    Object.freeze({ target: 'product', aspectRatio: 0.5 }),
    Object.freeze({ target: 'product-secondary', aspectRatio: 1.8 }),
  ]);
  const freeTextBox = Object.freeze({ x: 120, y: 430, width: 840, height: 80 });
  const input = Object.freeze(inputFor('two-products', [], { products, freeTextBox }));
  const first = assertUsableLayout(input);
  const second = createAutoLayout(input);
  assert.deepEqual(second, first);
  assert.equal(input.products, products);
  assert.equal(input.freeTextBox, freeTextBox);
});

test('invalid or incomplete product compositions cannot generate a layout', () => {
  const cases = [
    undefined,
    null,
    {},
    inputFor('unknown'),
    inputFor('single', [], { products: [] }),
    inputFor('two-products', [], { products: [{ target: 'product', aspectRatio: 1 }] }),
    inputFor('combo', [], { products: [{ target: 'product', aspectRatio: 1 }] }),
    inputFor('single', [], { products: [{ target: 'unknown', aspectRatio: 1 }] }),
    inputFor('two-products', [], { products: [{ target: 'product', aspectRatio: 1 }, { target: 'product', aspectRatio: 1 }] }),
    ...[0, -1, NaN, Infinity, undefined].map((aspectRatio) => inputFor('single', [aspectRatio])),
    inputFor('single', [1], { measureDetails: undefined }),
  ];
  for (const input of cases) assert.equal(createAutoLayout(input), null);
});

test('invalid measurements and a completely occupied safe area return no layout', () => {
  for (const measurement of [
    { width: 0, height: 100 },
    { width: 100, height: -1 },
    { width: NaN, height: 100 },
    { width: 100, height: Infinity },
    { width: 2000, height: 2000 },
  ]) {
    assert.equal(createAutoLayout(inputFor('single', [1], { measureDetails: () => measurement })), null);
  }
  for (const mode of ['single', 'two-products', 'combo']) {
    assert.equal(createAutoLayout(inputFor(mode, [1, 1], {
      freeTextBox: { x: 56, y: 408, width: 968, height: 1456 },
    })), null);
  }
});
