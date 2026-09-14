import { MIN_DETAILS_WIDTH, STORY_HEIGHT, STORY_SAFE_TOP, STORY_WIDTH } from './constants.js';

const GAP = 32;
const MARGIN = 56;
const SAFE_AREA = {
  x: MARGIN,
  y: STORY_SAFE_TOP + 24,
  width: STORY_WIDTH - MARGIN * 2,
  height: STORY_HEIGHT - MARGIN - STORY_SAFE_TOP - 24,
};
const EPSILON = 0.01;

function intersects(first, second) {
  return first.x < second.x + second.width - EPSILON
    && first.x + first.width > second.x + EPSILON
    && first.y < second.y + second.height - EPSILON
    && first.y + first.height > second.y + EPSILON;
}

function contains(area, box) {
  return box.x >= area.x - EPSILON && box.y >= area.y - EPSILON
    && box.x + box.width <= area.x + area.width + EPSILON
    && box.y + box.height <= area.y + area.height + EPSILON;
}

function availableAreas(obstacle) {
  if (!obstacle || !intersects(SAFE_AREA, obstacle)) return [SAFE_AREA];
  const right = SAFE_AREA.x + SAFE_AREA.width;
  const bottom = SAFE_AREA.y + SAFE_AREA.height;
  return [
    { ...SAFE_AREA, height: obstacle.y - SAFE_AREA.y },
    { ...SAFE_AREA, y: obstacle.y + obstacle.height, height: bottom - obstacle.y - obstacle.height },
    { ...SAFE_AREA, width: obstacle.x - SAFE_AREA.x },
    { ...SAFE_AREA, x: obstacle.x + obstacle.width, width: right - obstacle.x - obstacle.width },
  ].filter((area) => area.width >= MIN_DETAILS_WIDTH && area.height > GAP);
}

function fitProduct(product, area, scale = 1) {
  const width = Math.min(area.width, area.height * product.aspectRatio) * scale;
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + area.height - width / product.aspectRatio,
    width,
  };
}

/**
 * Fits the current artwork without DOM, canvas or state mutations. Card sizes
 * come from the same text measurement used by the renderer, including prices.
 * A details transform stores its logical width; the painted card is centered
 * inside that width. The existing free text remains at its current position.
 */
export function createAutoLayout(options) {
  if (!options || typeof options !== 'object') return null;
  const { mode, products, measureDetails, freeTextBox = null } = options;
  const count = mode === 'single' ? 1 : 2;
  if (!['single', 'two-products', 'combo'].includes(mode)
    || !Array.isArray(products) || products.length !== count
    || typeof measureDetails !== 'function'
    || products.some((product, index) => !product
      || product.target !== (index ? 'product-secondary' : 'product')
      || !Number.isFinite(product.aspectRatio) || product.aspectRatio <= 0)) return null;

  if (freeTextBox && ['x', 'y', 'width', 'height'].some((key) => !Number.isFinite(freeTextBox[key]))) return null;
  if (freeTextBox && (freeTextBox.width < 0 || freeTextBox.height < 0)) return null;
  const obstacle = freeTextBox ? {
    x: freeTextBox.x - GAP,
    y: freeTextBox.y - GAP,
    width: freeTextBox.width + GAP * 2,
    height: freeTextBox.height + GAP * 2,
  } : null;
  const detailTargets = mode === 'two-products' ? ['details', 'details-secondary'] : ['details'];
  const measurements = new Map();
  let best = null;
  let bestScore = -Infinity;

  function measure(target, width) {
    if (width < MIN_DETAILS_WIDTH || width > STORY_WIDTH - 48) return null;
    const key = `${target}:${width}`;
    if (!measurements.has(key)) {
      const size = measureDetails(target, width);
      measurements.set(key, size && Number.isFinite(size.width) && Number.isFinite(size.height)
        && size.width > 0 && size.width <= width + EPSILON && size.height > 0 ? size : null);
    }
    return measurements.get(key);
  }

  function consider(candidate, area) {
    const boxes = products.map((product) => {
      const transform = candidate.products[product.target];
      return { ...transform, height: transform.width / product.aspectRatio };
    });
    const productAreas = boxes.map((box) => box.width * box.height);
    for (const target of detailTargets) {
      const transform = candidate.details[target];
      const size = measure(target, transform.width);
      if (!size) return;
      boxes.push({ x: transform.x + (transform.width - size.width) / 2, y: transform.y, ...size });
    }
    if (boxes.some((box) => !Number.isFinite(box.x + box.y + box.width + box.height)
      || box.width <= 0 || box.height <= 0 || !contains(area, box)
      || !contains(SAFE_AREA, box) || (obstacle && intersects(box, obstacle)))) return;
    if (boxes.some((box, index) => boxes.slice(index + 1).some((other) => intersects(box, other)))) return;

    // Reward visible product area and readable offers. A square root keeps a
    // very wide package from dominating a narrow bottle in the same campaign.
    const productScore = productAreas.reduce((sum, size) => sum + Math.sqrt(size / (SAFE_AREA.width * SAFE_AREA.height)), 0) / count;
    const idealCardWidth = mode === 'two-products' ? 440 : 820;
    const textScore = detailTargets.reduce((sum, target) => sum + Math.min(1.2, candidate.details[target].width / idealCardWidth), 0) / detailTargets.length;
    const score = productScore + textScore * (mode === 'two-products' ? 0.25 : 0.2);
    if (score > bestScore + EPSILON / 100) {
      best = candidate;
      bestScore = score;
    }
  }

  function vertical(area, factor, pairArrangement = 'row') {
    const separate = mode === 'two-products';
    const cellWidth = separate ? (area.width - GAP) / 2 : area.width;
    const width = cellWidth * factor;
    const sizes = detailTargets.map((target) => measure(target, width));
    if (sizes.some((size) => !size)) return;
    const detailsHeight = Math.max(...sizes.map((size) => size.height));
    const productHeight = area.height - detailsHeight - GAP;
    if (productHeight <= 0) return;
    const candidate = { products: {}, details: {}, arrangement: separate ? 'columns' : mode === 'single' ? 'single' : `combo-${pairArrangement}` };
    let usedHeight;

    if (mode === 'single' || separate) {
      products.forEach((product, index) => {
        candidate.products[product.target] = fitProduct(product, {
          x: area.x + index * (cellWidth + GAP), y: 0, width: cellWidth, height: productHeight,
        }, separate ? 0.9 : 1);
      });
      usedHeight = Math.max(...products.map((product) => candidate.products[product.target].width / product.aspectRatio));
    } else if (pairArrangement === 'stack') {
      const width = Math.min(area.width, (productHeight - GAP) / products.reduce((sum, product) => sum + 1 / product.aspectRatio, 0));
      if (width <= 0) return;
      let y = 0;
      products.forEach((product) => {
        candidate.products[product.target] = { x: area.x + (area.width - width) / 2, y, width };
        y += width / product.aspectRatio + GAP;
      });
      usedHeight = y - GAP;
    } else if (pairArrangement === 'balanced') {
      const cellWidth = (area.width - GAP) / 2;
      products.forEach((product, index) => {
        candidate.products[product.target] = fitProduct(product, {
          x: area.x + index * (cellWidth + GAP), y: 0, width: cellWidth, height: productHeight,
        });
      });
      usedHeight = Math.max(...products.map((product) => candidate.products[product.target].width / product.aspectRatio));
    } else {
      const height = Math.min(productHeight, (area.width - GAP) / products.reduce((sum, product) => sum + product.aspectRatio, 0));
      const groupWidth = products.reduce((sum, product) => sum + height * product.aspectRatio, GAP);
      let x = area.x + (area.width - groupWidth) / 2;
      products.forEach((product) => {
        const width = height * product.aspectRatio;
        candidate.products[product.target] = { x, y: 0, width };
        x += width + GAP;
      });
      usedHeight = height;
    }

    const top = area.y + (area.height - usedHeight - GAP - detailsHeight) / 2;
    products.forEach((product) => {
      const transform = candidate.products[product.target];
      transform.y = pairArrangement === 'stack' && mode === 'combo'
        ? top + transform.y : top + usedHeight - transform.width / product.aspectRatio;
    });
    detailTargets.forEach((target, index) => {
      candidate.details[target] = {
        x: area.x + index * (cellWidth + GAP) + (cellWidth - width) / 2,
        y: top + usedHeight + GAP,
        width,
      };
    });
    consider(candidate, area);
  }

  function rows(area, factor) {
    const height = (area.height - GAP) / 2;
    const width = area.width * factor;
    const productWidth = area.width - width - GAP;
    if (productWidth <= 0 || height <= 0) return;
    const candidate = { products: {}, details: {}, arrangement: 'rows' };
    for (const [index, product] of products.entries()) {
      const target = detailTargets[index];
      const size = measure(target, width);
      if (!size || size.height > height) return;
      const y = area.y + index * (height + GAP);
      const transform = fitProduct(product, { x: area.x, y, width: productWidth, height });
      transform.y = y + (height - transform.width / product.aspectRatio) / 2;
      candidate.products[product.target] = transform;
      candidate.details[target] = { x: area.x + productWidth + GAP, y: y + (height - size.height) / 2, width };
    }
    consider(candidate, area);
  }

  for (const area of availableAreas(obstacle)) {
    // Text wrapping can change abruptly with width, so evaluate several sizes
    // instead of assuming that a narrower card is always shorter.
    for (const factor of [1, 0.9, 0.8, 0.7, 0.6]) {
      vertical(area, factor);
      if (mode === 'combo') {
        vertical(area, factor, 'balanced');
        vertical(area, factor, 'stack');
      }
    }
    if (mode === 'two-products') {
      // Reserve at least half the row for the offer so the product image
      // does not overwhelm its description and price.
      for (const factor of [0.5, 0.55, 0.6]) rows(area, factor);
    }
  }
  return best;
}
