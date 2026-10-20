import assert from 'node:assert/strict';
import test from 'node:test';
import { getBackgroundBadgeTheme } from '../public/js/features/stories/background-theme.js';

test('background palette ignores white space and chooses readable text for blue and yellow campaigns', () => {
  const previous = globalThis.document;
  try {
    for (const [rgb, text] of [[[0, 104, 168], '#ffffff'], [[250, 220, 30], '#0b2b33']]) {
      const data = new Uint8ClampedArray(1600);
      for (let i = 0; i < data.length; i += 4) data.set(i < 1200 ? [255, 255, 255, 255] : [...rgb, 255], i);
      let sampled;
      globalThis.document = { createElement: () => ({
        getContext: () => ({
          drawImage() {},
          getImageData(x, y, width, height) { sampled = [width, height]; return { data }; },
        }),
      }) };
      const theme = getBackgroundBadgeTheme({ naturalWidth: 1920, naturalHeight: 1080 }, { width: 128, height: 72 });
      assert.deepEqual(sampled, [128, 72]);
      assert.deepEqual(theme, { fill: `rgb(${rgb.join(', ')})`, text });
    }
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('missing or unreadable backgrounds use a safe fallback', () => {
  assert.deepEqual(getBackgroundBadgeTheme(null), { fill: '#0e746c', text: '#ffffff' });
  assert.deepEqual(getBackgroundBadgeTheme({}), { fill: '#0e746c', text: '#ffffff' });
});
