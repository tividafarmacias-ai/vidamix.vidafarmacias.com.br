import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INDOOR_WIDTH, INDOOR_HEIGHT, INDOOR_DURATION, INDOOR_PRODUCT_COUNT,
  getIndoorDuration, getCarouselState, drawIndoorFrame,
} from '../public/js/features/indoor/renderer.js';

function mockContext() {
  const stack = [];
  const calls = [];
  const context = {
    calls,
    font: '10px Arial',
    globalAlpha: 0.4,
    shadowBlur: 8,
    offsetX: 0,
    save() {
      stack.push(Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function' && value !== calls)));
    },
    restore() {
      const state = stack.pop();
      assert.ok(state, 'every restore must have a matching save');
      for (const key of Object.keys(this)) {
        if (typeof this[key] !== 'function' && this[key] !== calls) delete this[key];
      }
      Object.assign(this, state);
    },
    setTransform() { this.offsetX = 0; },
    translate(x) { this.offsetX += x; },
    measureText(value) { return { width: Array.from(value).length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.6 }; },
    fillText(text, x, y) {
      calls.push({ type: 'text', text, x, y, width: this.measureText(text).width, font: this.font, color: this.fillStyle, offsetX: this.offsetX });
    },
    drawImage(...args) { calls.push({ type: 'image', args, offsetX: this.offsetX, alpha: this.globalAlpha }); },
    fillRect(...args) { calls.push({ type: 'fillRect', args }); },
    rect(...args) { calls.push({ type: 'clipRect', args }); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() { calls.push({ type: 'fill', color: this.fillStyle }); },
    clip() {},
    assertBalanced() { assert.equal(stack.length, 0); },
  };
  return context;
}

function snapshot(overrides = {}) {
  return {
    background: { width: 1920, height: 1080, id: 'background' },
    products: Array.from({ length: 5 }, (_, index) => ({
      product: { nome: `Produto ${index + 1}`, subtitulo: 'Conteúdo da embalagem', fabricante: 'VidaMix' },
      image: { width: 600, height: 1000, id: index },
      price: 'R$ 19,90',
    })),
    ...overrides,
  };
}

test('Indoor keeps eight-second offers with a 43-second campaign or a 40-second legacy loop', () => {
  assert.deepEqual([INDOOR_WIDTH, INDOOR_HEIGHT, INDOOR_DURATION, INDOOR_PRODUCT_COUNT], [1920, 1080, 43, 5]);
  assert.equal(getIndoorDuration(true), 43);
  assert.equal(getIndoorDuration(false), 40);
  for (let index = 0; index < 5; index += 1) {
    for (const phase of [0, 4, 7.5]) {
      const state = getCarouselState(index * 8 + phase);
      assert.equal(state.index, index);
      assert.equal(state.transition, false);
      assert.deepEqual(state.slides, [{ index, offsetX: 0, opacity: 1 }]);
      assert.deepEqual(getCarouselState(index * 8 + phase), state);
    }
  }
  assert.deepEqual(getCarouselState(40), getCarouselState(0));
  assert.deepEqual(getCarouselState(120), getCarouselState(0));
  for (const invalid of [-10, NaN, Infinity, undefined]) assert.deepEqual(getCarouselState(invalid), getCarouselState(0));
});

test('each transition slides to the next product and the last slides back to the first', () => {
  for (let index = 0; index < 5; index += 1) {
    const middle = getCarouselState(index * 8 + 7.825);
    assert.equal(middle.transition, true);
    assert.equal(middle.nextIndex, (index + 1) % 5);
    assert.ok(Math.abs(middle.progress - 0.5) < 1e-12);
    assert.equal(middle.slides.length, 2);
    assert.ok(Math.abs(middle.slides[0].offsetX + 640) < 1e-8);
    assert.ok(Math.abs(middle.slides[1].offsetX - 640) < 1e-8);
    assert.ok(Math.abs(middle.slides[1].offsetX - middle.slides[0].offsetX - 1280) < 1e-8);
    const before = getCarouselState((index + 1) * 8 - 0.000001);
    const after = getCarouselState((index + 1) * 8);
    assert.ok(Math.abs(before.slides[1].offsetX - after.slides[0].offsetX) < 0.001);
    assert.equal(before.slides[1].index, after.slides[0].index);
  }
});

test('renderer paints only the visible product, or two products during a transition', () => {
  const input = snapshot();
  for (const [seconds, expectedProducts] of [[1, [0]], [16, [2]], [39.9, [4, 0]]]) {
    const context = mockContext();
    const state = drawIndoorFrame(context, input, seconds);
    assert.deepEqual(state, getCarouselState(seconds));
    assert.deepEqual(context.calls.filter((call) => call.type === 'image').map((call) => call.args[0].id), ['background', ...expectedProducts]);
    assert.equal(context.globalAlpha, 0.4);
    assert.equal(context.shadowBlur, 8);
    context.assertBalanced();
  }
});

test('background cover crops without distortion and product contain fits the safe area', () => {
  const input = snapshot({ background: { width: 1000, height: 1000 } });
  input.products[0].image = { width: 4000, height: 100 };
  const context = mockContext();
  drawIndoorFrame(context, input, 0);
  const images = context.calls.filter((call) => call.type === 'image');
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = images[0].args;
  assert.deepEqual([sx, sy, sw, sh, dx, dy, dw, dh], [0, 218.75, 1000, 562.5, 0, 0, 1920, 1080]);
  assert.ok(Math.abs(sw / sh - dw / dh) < 1e-10);
  const [, x, y, width, height] = images[1].args;
  assert.equal(width / height, 40);
  assert.ok(x >= 340 && y >= 274 && x + width <= 880 && y + height <= 1024);
  assert.deepEqual(context.calls.find((call) => call.type === 'clipRect').args, [324, 270, 1280, 762]);
  context.assertBalanced();
});

test('long names, descriptions, manufacturer and prices remain inside the details card', () => {
  const input = snapshot();
  Object.assign(input.products[0], {
    product: { nome: 'Nome muito longo de produto '.repeat(1000), subtitulo: 'Descrição e quantidade '.repeat(1000), fabricante: 'Fabricante'.repeat(1000) },
    price: `R$ ${'999'.repeat(1000)},99`,
  });
  const context = mockContext();
  drawIndoorFrame(context, input, 0);
  const textCalls = context.calls.filter((call) => call.type === 'text');
  assert.equal(textCalls.length, 8, 'one manufacturer, three title lines, two description lines, price label and value');
  assert.ok(textCalls.some((call) => call.text.endsWith('…')));
  for (const call of textCalls) {
    assert.ok(call.text.length < 100);
    assert.ok(call.width <= 574);
    assert.ok(call.x >= 968 && call.x + call.width <= 1542);
    assert.ok(call.y >= 380 && call.y + Number(call.font.match(/([\d.]+)px/)[1]) <= 1020);
  }
  context.assertBalanced();
});

test('price is optional and no preview controls or timing labels are painted', () => {
  const input = snapshot();
  input.products[0].price = '';
  const context = mockContext();
  drawIndoorFrame(context, input, 0);
  const texts = context.calls.filter((call) => call.type === 'text').map((call) => call.text);
  assert.deepEqual(texts, ['VidaMix', 'Produto 1', 'Conteúdo da embalagem']);
});

test('stationary and sliding offers are clipped clear of the actual templates campaign marks', () => {
  for (const seconds of [0, 7.825, 15.825, 31.9, 39.9999]) {
    const context = mockContext();
    drawIndoorFrame(context, snapshot(), seconds);
    const clipIndex = context.calls.findIndex((call) => call.type === 'clipRect');
    const clip = context.calls[clipIndex].args;
    assert.deepEqual(clip, [324, 270, 1280, 762]);
    assert.ok(clip[0] >= 324 && clip[1] >= 270, 'reserve the title at the top and balloons at either side');
    assert.ok(clipIndex > 0, 'paint the fixed background before restricting moving content');
    for (const [index, call] of context.calls.entries()) {
      if (call.type === 'text' || (call.type === 'image' && call.args[0].id !== 'background')) {
        assert.ok(index > clipIndex, 'all product images and offer text must be drawn within the clip');
      }
    }
    context.assertBalanced();
  }
});

test('renderer requires exactly five entries and does not mutate the snapshot', () => {
  for (const products of [[], Array(4).fill({}), Array(6).fill({}), [null, {}, {}, {}, {}]]) {
    const context = mockContext();
    assert.throws(() => drawIndoorFrame(context, snapshot({ products }), 0), /exatamente 5 produtos/);
    assert.equal(context.calls.length, 0);
    context.assertBalanced();
  }
  const input = snapshot();
  const original = structuredClone(input);
  drawIndoorFrame(mockContext(), input, 2.9);
  assert.deepEqual(input, original);
});

test('renderer restores all canvas state when drawing fails', () => {
  const context = mockContext();
  context.fillText = () => { throw new Error('draw failure'); };
  assert.throws(() => drawIndoorFrame(context, snapshot(), 2.9), /draw failure/);
  assert.equal(context.globalAlpha, 0.4);
  assert.equal(context.shadowBlur, 8);
  context.assertBalanced();
});

test('normal and promotional prices have separate space below long descriptions', () => {
  const input = snapshot();
  input.products[0].originalPrice = 'R$ 29,90';
  input.products[0].product.nome = 'Produto com nome extenso '.repeat(20);
  input.products[0].product.subtitulo = 'Descri??o da embalagem '.repeat(20);
  const context = mockContext();
  drawIndoorFrame(context, input, 0);
  const texts = context.calls.filter(call => call.type === 'text');
  const normal = texts.find(call => call.text === 'De R$ 29,90');
  const promo = texts.find(call => call.text === 'R$ 19,90');
  assert.ok(normal && promo);
  assert.ok(texts.some(call => call.text === 'por'));
  const fontSize = call => Number(call.font.match(/([\d.]+)px/)[1]);
  for (const description of texts.slice(0, 6)) {
    assert.ok(description.y + fontSize(description) < normal.y - 18);
  }
  assert.ok(normal.y + fontSize(normal) < promo.y);
  assert.ok(fontSize(promo) > fontSize(normal));
  assert.ok(context.calls.some(call => call.type === 'fillRect' && call.args[1] === normal.y + 28 && call.args[3] === 3));
});

test('short descriptions keep the offer close and the promotional price dominates', () => {
  const input = snapshot();
  input.products[0].originalPrice = 'R$ 10,45';
  input.products[0].price = 'R$ 10,00';
  const context = mockContext();
  drawIndoorFrame(context, input, 0);
  const texts = context.calls.filter(call => call.type === 'text');
  const subtitle = texts[2];
  const normal = texts.find(call => call.text === 'De R$ 10,45');
  const price = texts.find(call => call.text === 'R$ 10,00');
  assert.ok(normal.y - subtitle.y < 180, 'the price sits directly below the description card');
  assert.ok(!texts.some(call => call.text === 'OFERTA'), 'reference has no colored offer badge');
  assert.ok(Number(price.font.match(/([\d.]+)px/)[1]) >= 112);
  assert.ok(price.y + Number(price.font.match(/([\d.]+)px/)[1]) <= 1020);
});

test('promotional price uses the campaign color with a dark fallback for bright backgrounds', () => {
  for (const badgeTheme of [{ fill: 'rgb(0, 104, 168)', text: '#ffffff' }, { fill: 'rgb(250, 220, 30)', text: '#0b2b33' }]) {
    const input = snapshot({ badgeTheme });
    input.products[0].originalPrice = 'R$ 29,90';
    const context = mockContext();
    drawIndoorFrame(context, input, 0);
    assert.equal(context.calls.find(call => call.text === 'De R$ 29,90').color, '#080808');
    assert.equal(context.calls.find(call => call.text === 'por').color, '#080808');
    assert.equal(context.calls.find(call => call.text === 'R$ 19,90').color,
      badgeTheme.text === '#ffffff' ? badgeTheme.fill : '#142c54');
  }
});

test('wallpaper opens alone, reveals the first offer, then returns seamlessly at the loop boundary', () => {
  const input = snapshot({ wallpaper: { width: 1920, height: 1080, id: 'wallpaper' } });
  for (const time of [0, 1, 2]) {
    const context = mockContext();
    const state = drawIndoorFrame(context, input, time);
    assert.equal(state.phase, 'intro');
    assert.equal(state.index, -1);
    assert.deepEqual(context.calls.filter(call => call.type === 'image').map(call => call.args[0].id), ['wallpaper']);
    assert.ok(!context.calls.some(call => call.type === 'text'), 'intro must not include a product or price');
    context.assertBalanced();
  }
  const reveal = mockContext();
  const state = drawIndoorFrame(reveal, input, 2.55);
  assert.equal(state.phase, 'reveal');
  const curtains = reveal.calls.filter(call => call.type === 'image' && call.args[0].id === 'wallpaper');
  assert.equal(curtains.length, 2);
  assert.ok(curtains[0].offsetX < 0 && curtains[1].offsetX > 0, 'wallpaper halves move apart');
  assert.deepEqual(reveal.calls.filter(call => call.type === 'image').slice(0, 2).map(call => call.args[0].id), ['background', 0]);
  reveal.assertBalanced();

  for (let product = 0; product < 5; product++) {
    assert.equal(getCarouselState(3 + product * 8, { hasWallpaper: true }).index, product);
    assert.equal(getCarouselState(3 + product * 8 + 4, { hasWallpaper: true }).index, product);
  }
  const last = mockContext();
  assert.equal(drawIndoorFrame(last, input, 43 - 1 / 30).phase, 'return');
  const closing = last.calls.filter(call => call.type === 'image').at(-1);
  assert.equal(closing.args[0].id, 'wallpaper');
  assert.ok(closing.alpha > 0.99);
  last.assertBalanced();
  const first = mockContext();
  const loop = mockContext();
  drawIndoorFrame(first, input, 0);
  drawIndoorFrame(loop, input, 43);
  assert.deepEqual(loop.calls, first.calls, 'end boundary and opening render exactly the same frame');
});
