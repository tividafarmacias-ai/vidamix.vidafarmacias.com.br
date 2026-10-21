import { INDOOR_DURATION_TIERS, DEFAULT_INDOOR_DURATION } from './model.js';

export const INDOOR_WIDTH = 1920;
export const INDOOR_HEIGHT = 1080;
export const INDOOR_PRODUCT_COUNT = 5;
export const INDOOR_INTRO_DURATION = 3;

const TRANSITION_DURATION = 0.35;
const REVEAL_DURATION = 0.9;
const LOOP_RETURN_DURATION = 0.8;
// Keep animated content inside the reference template's white offer area.
// The campaign title occupies the top 250 px; balloons flank the offer.
const SAFE_LEFT = 324;
const SAFE_RIGHT = 1604;
const SAFE_TOP = 270;
const SAFE_BOTTOM = 1032;
const SLIDE_WIDTH = SAFE_RIGHT - SAFE_LEFT;
const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
const PRODUCT_BOX = { x: 340, y: 274, width: 540, height: 750 };
const CARD = { x: 924, y: 332, width: 662 };

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ease(value) {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

/** Per-product exposure tiers; anything else falls back to the ten-second default. */
export function getProductDurations(products = []) {
  return products.map((entry) => {
    const duration = Number(entry?.duration);
    return INDOOR_DURATION_TIERS.includes(duration) ? duration : DEFAULT_INDOOR_DURATION;
  });
}

export function getIndoorDuration(hasWallpaper = false, products = []) {
  const offers = getProductDurations(products).reduce((sum, duration) => sum + duration, 0);
  return (hasWallpaper ? INDOOR_INTRO_DURATION : 0) + offers;
}

/** One timeline for preview, scene navigation and frame-by-frame MP4 rendering. */
export function getCarouselState(seconds, { hasWallpaper = false, products = [] } = {}) {
  const durations = getProductDurations(products);
  const total = getIndoorDuration(hasWallpaper, products);
  const input = Number(seconds);
  const time = Number.isFinite(input) ? Math.max(0, input) % total : 0;
  const intro = hasWallpaper ? INDOOR_INTRO_DURATION : 0;
  if (time < intro) {
    const progress = clamp((time - (intro - REVEAL_DURATION)) / REVEAL_DURATION, 0, 1);
    return {
      phase: progress > 0 ? 'reveal' : 'intro', time, index: -1, nextIndex: 0,
      progress, transition: progress > 0,
      slides: progress > 0 ? [{ index: 0, offsetX: 0, opacity: 1 }] : [],
    };
  }
  const offerTime = time - intro;
  let index = 0;
  let cumulative = 0;
  while (index < durations.length - 1 && offerTime >= cumulative + durations[index]) {
    cumulative += durations[index];
    index += 1;
  }
  const localTime = offerTime - cumulative;
  const nextIndex = (index + 1) % durations.length;
  if (hasWallpaper && index === durations.length - 1) {
    const progress = clamp((localTime - (durations[index] - LOOP_RETURN_DURATION)) / LOOP_RETURN_DURATION, 0, 1);
    return {
      phase: progress > 0 ? 'return' : 'products', time, index, nextIndex: -1,
      progress, transition: progress > 0, slides: [{ index, offsetX: 0, opacity: 1 }],
    };
  }
  const progress = clamp((localTime - (durations[index] - TRANSITION_DURATION)) / TRANSITION_DURATION, 0, 1);
  const eased = ease(progress);
  const slides = [{ index, offsetX: eased === 0 ? 0 : -SLIDE_WIDTH * eased, opacity: 1 }];
  if (progress > 0) slides.push({ index: nextIndex, offsetX: SLIDE_WIDTH * (1 - eased), opacity: 1 });
  return { phase: 'products', time, index, nextIndex, progress, transition: progress > 0, slides };
}

function imageSize(image) {
  if (!image) return null;
  const width = Number(image.naturalWidth ?? image.videoWidth ?? image.width);
  const height = Number(image.naturalHeight ?? image.videoHeight ?? image.height);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function drawBackground(context, background, zoom = 1) {
  context.fillStyle = '#edf3fa';
  context.fillRect(0, 0, INDOOR_WIDTH, INDOOR_HEIGHT);
  const size = imageSize(background);
  if (!size) return;
  const scale = Math.max(INDOOR_WIDTH / size.width, INDOOR_HEIGHT / size.height) * zoom;
  const sourceWidth = INDOOR_WIDTH / scale;
  const sourceHeight = INDOOR_HEIGHT / scale;
  context.drawImage(background,
    (size.width - sourceWidth) / 2, (size.height - sourceHeight) / 2, sourceWidth, sourceHeight,
    0, 0, INDOOR_WIDTH, INDOOR_HEIGHT);
}

function drawWallpaperReveal(context, wallpaper, progress) {
  const movement = ease(progress);
  // Two diagonal halves of the actual wallpaper slide apart like curtains.
  // Clip after translation so the image and its mask move together.
  for (const direction of [-1, 1]) {
    context.save();
    try {
      context.translate(direction * 1240 * movement, direction * 70 * movement);
      context.beginPath();
      if (direction === -1) {
        context.moveTo(0, 0);
        context.lineTo(722, 0);
        context.lineTo(1202, INDOOR_HEIGHT);
        context.lineTo(0, INDOOR_HEIGHT);
      } else {
        context.moveTo(720, 0);
        context.lineTo(INDOOR_WIDTH, 0);
        context.lineTo(INDOOR_WIDTH, INDOOR_HEIGHT);
        context.lineTo(1200, INDOOR_HEIGHT);
      }
      context.closePath();
      context.clip();
      drawBackground(context, wallpaper, 1.025);
    } finally {
      context.restore();
    }
  }
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, 1200);
}

function ellipsize(context, text, width) {
  if (context.measureText(text).width <= width) return text;
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join('').trimEnd()}…`;
    if (context.measureText(candidate).width <= width) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, low).join('').trimEnd()}…`;
}

function wrapText(context, value, width, maximumLines) {
  const text = cleanText(value);
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  while (words.length && lines.length < maximumLines) {
    if (lines.length === maximumLines - 1) {
      lines.push(ellipsize(context, words.join(' '), width));
      break;
    }
    let line = words.shift();
    while (words.length && context.measureText(`${line} ${words[0]}`).width <= width) {
      line += ` ${words.shift()}`;
    }
    lines.push(ellipsize(context, line, width));
  }
  return lines;
}

function roundedRectangle(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawDetails(context, entry, badgeTheme) {
  const product = entry.product || {};
  const contentX = CARD.x + 44;
  const contentWidth = CARD.width - 88;

  context.save();
  try {
    const manufacturer = cleanText(product.fabricante);
    const originalPrice = cleanText(entry.originalPrice);
    const price = cleanText(entry.price);
    // Shrink long copy within the description card; reserve a separate price area.
    let titleSize = 60;
    let titleLines;
    let descriptionHeight;
    context.font = `400 32px ${FONT_FAMILY}`;
    const subtitleLines = wrapText(context, product.subtitulo, contentWidth, 2);
    do {
      context.font = `700 ${titleSize}px ${FONT_FAMILY}`;
      titleLines = wrapText(context, product.nome || 'Produto', contentWidth, 3);
      descriptionHeight = (manufacturer ? 50 : 0) + titleLines.length * titleSize * 1.16
        + (subtitleLines.length ? 18 + subtitleLines.length * 38 : 0);
      if (descriptionHeight <= 290 || titleSize <= 44) break;
      titleSize -= 2;
    } while (true);
    const panelHeight = Math.max(322, descriptionHeight + 80);
    const panelY = CARD.y;

    context.shadowColor = 'rgba(0, 0, 0, 0.16)';
    context.shadowBlur = 12;
    context.shadowOffsetY = 4;
    context.fillStyle = '#ffffff';
    roundedRectangle(context, CARD.x, panelY, CARD.width, panelHeight, 32);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.textBaseline = 'top';
    context.textAlign = 'left';

    let titleY = panelY + 48;
    if (manufacturer) {
      context.font = `600 28px ${FONT_FAMILY}`;
      context.fillStyle = '#5b677d';
      context.fillText(ellipsize(context, manufacturer, contentWidth), contentX, titleY);
      titleY += 50;
    }

    context.font = `700 ${titleSize}px ${FONT_FAMILY}`;
    context.fillStyle = '#142c54';
    titleLines.forEach((line, index) => context.fillText(line, contentX, titleY + index * titleSize * 1.16));

    const subtitleY = titleY + titleLines.length * titleSize * 1.16 + 18;
    context.font = `400 32px ${FONT_FAMILY}`;
    context.fillStyle = '#49566b';
    subtitleLines.forEach((line, index) => context.fillText(line, contentX, subtitleY + index * 38));

    if (originalPrice || price) {
      let priceY = panelY + panelHeight + 34;
      if (originalPrice) {
        context.font = `600 48px ${FONT_FAMILY}`;
        context.fillStyle = '#080808';
        const label = ellipsize(context, 'De ' + originalPrice, contentWidth);
        context.fillText(label, contentX, priceY);
        const labelWidth = context.measureText('De ').width;
        context.fillRect(contentX + labelWidth, priceY + 28,
          Math.max(0, context.measureText(label).width - labelWidth), 3);
        priceY += 60;
      }
      if (price) {
        context.font = `600 48px ${FONT_FAMILY}`;
        context.fillStyle = '#080808';
        context.fillText('por', contentX, priceY);
        priceY += 60;
        let fontSize = Math.min(170, Math.floor((1020 - priceY) / 1.15));
        context.font = `900 ${fontSize}px ${FONT_FAMILY}`;
        while (fontSize > 40 && context.measureText(price).width > contentWidth) {
          fontSize -= 2;
          context.font = `900 ${fontSize}px ${FONT_FAMILY}`;
        }
        // The theme's dark text is safer than a bright campaign color on white.
        context.fillStyle = badgeTheme.text === '#ffffff' ? badgeTheme.fill : '#142c54';
        context.fillText(ellipsize(context, price, contentWidth), contentX, priceY);
      }
    }
  } finally {
    context.restore();
  }
}

function drawProduct(context, entry, badgeTheme) {
  const size = imageSize(entry.image);
  if (size) {
    const scale = Math.min(PRODUCT_BOX.width / size.width, PRODUCT_BOX.height / size.height);
    const width = size.width * scale;
    const height = size.height * scale;
    context.drawImage(entry.image,
      PRODUCT_BOX.x + (PRODUCT_BOX.width - width) / 2,
      PRODUCT_BOX.y + (PRODUCT_BOX.height - height) / 2,
      width, height);
  }
  drawDetails(context, entry, badgeTheme);
}

/**
 * Paints directly into the supplied 1920×1080 canvas; no intermediate canvases or DOM.
 * products: exactly five { product: { nome, subtitulo, fabricante }, image, originalPrice, price, duration } entries;
 * duration is one of the 10/15/20-second tiers and anything else falls back to ten seconds.
 * background and image must be loaded CanvasImageSources. Missing images are skipped.
 * Returns the carousel state used, so preview controls can follow the same timeline.
 */
export function drawIndoorFrame(context, { background, wallpaper, products, badgeTheme = { fill: '#2768dc', text: '#ffffff' } }, seconds) {
  if (!Array.isArray(products) || products.length !== INDOOR_PRODUCT_COUNT || products.some((entry) => !entry)) {
    throw new RangeError('O vídeo Indoor precisa de exatamente 5 produtos.');
  }
  const state = getCarouselState(seconds, { hasWallpaper: Boolean(imageSize(wallpaper)), products });
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (state.phase === 'intro') {
      drawBackground(context, wallpaper, 1 + 0.025 * ease(state.time / (INDOOR_INTRO_DURATION - REVEAL_DURATION)));
      return state;
    }
    drawBackground(context, background);

    context.save();
    try {
      context.beginPath();
      context.rect(SAFE_LEFT, SAFE_TOP, SLIDE_WIDTH, SAFE_BOTTOM - SAFE_TOP);
      context.clip();
      for (const slide of state.slides) {
        context.save();
        try {
          context.translate(slide.offsetX, 0);
          drawProduct(context, products[slide.index], badgeTheme);
        } finally {
          context.restore();
        }
      }
    } finally {
      context.restore();
    }
    if (state.phase === 'reveal') drawWallpaperReveal(context, wallpaper, state.progress);
    if (state.phase === 'return') {
      // Finish on the exact opening image for a continuous loop on the TV.
      const progress = ease(state.progress);
      context.globalAlpha = progress;
      drawBackground(context, wallpaper, 1 + 0.025 * (1 - progress));
    }
  } finally {
    context.restore();
  }
  return state;
}
