import {
  DEFAULT_DETAILS_WIDTH,
  DEFAULT_FREE_TEXT_WIDTH,
  DEFAULT_PRODUCT_AREA,
  DEFAULT_TWO_PRODUCT_AREAS,
  DESCRIPTION_CARD_PADDING,
  FREE_TEXT_LETTER_SPACING_RATIO,
  MIN_DETAILS_WIDTH,
  MIN_FREE_TEXT_WIDTH,
  MIN_PRODUCT_WIDTH,
  PRODUCT_PAGE_SIZE,
  STORY_HEIGHT,
  STORY_SAFE_TOP,
  STORY_WIDTH,
} from './constants.js';
import { getStoriesEditorElements } from './dom.js';
import { createStoriesEditorState } from './state.js';

const state = createStoriesEditorState();
const elements = getStoriesEditorElements();

let searchTimer;
let detailsMeasureContext;

const COMPOSITION_MODES = new Set(['single', 'two-products', 'combo']);

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent !== undefined && textContent !== null) element.textContent = textContent;
  return element;
}

async function requestJson(url, { signal } = {}) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os dados.');
  return payload;
}

function getPreselectedProductId() {
  if (typeof window === 'undefined') return null;

  const value = new URLSearchParams(window.location.search).get('productId');
  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const productId = Number(value);
  return Number.isSafeInteger(productId) ? productId : null;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
}

function parsePrice(value) {
  const cleanValue = String(value || '').trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!cleanValue) return null;

  const numericValue = cleanValue
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const amount = Number(numericValue);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatPrice(value) {
  const cleanValue = String(value || '').trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  const amount = parsePrice(cleanValue);
  if (amount === null) return cleanValue;

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getPriceForDetailsTarget(target = 'details') {
  return target === 'details-secondary' ? state.secondaryPrice : state.price;
}

function hasPrice(target = 'details') {
  return parsePrice(getPriceForDetailsTarget(target)) !== null;
}

function normalizeCompositionMode(value) {
  if (value === 'two') return 'two-products';
  return COMPOSITION_MODES.has(value) ? value : 'single';
}

function isTwoProductsMode() {
  return state.compositionMode === 'two-products';
}

function isComboMode() {
  return state.compositionMode === 'combo';
}

function compositionRequiresSecondaryProduct() {
  return isTwoProductsMode() || isComboMode();
}

function getCompositionProductLimit() {
  return state.compositionMode === 'single' ? 1 : 2;
}

function getDetailsProduct(target = 'details') {
  return target === 'details-secondary' ? state.secondaryProduct : state.selectedProduct;
}

function getDetailsProducts(target = 'details') {
  const product = getDetailsProduct(target);
  if (!product) return [];

  return target === 'details' && isComboMode()
    ? [state.selectedProduct, state.secondaryProduct].filter(Boolean)
    : [product];
}

function updateAvailability() {
  const secondaryProductReady = !compositionRequiresSecondaryProduct()
    || Boolean(
      state.secondaryProduct
        && state.secondaryProductImage
        && state.secondaryProductTransform,
    );
  const detailsReady = Boolean(
    state.detailsTransform
      && (!isTwoProductsMode() || state.secondaryDetailsTransform),
  );
  const pricesReady = hasPrice() && (!isTwoProductsMode() || hasPrice('details-secondary'));
  const ready = Boolean(
    state.selectedBackground
      && state.selectedProduct
      && state.backgroundImage
      && state.productImage
      && state.productTransform
      && detailsReady
      && secondaryProductReady
      && pricesReady,
  );
  elements.download.disabled = !ready;

  if (!state.selectedBackground) {
    setStatus('Carregando backgrounds disponíveis...');
  } else if (!state.selectedProduct) {
    setStatus('Escolha um produto com imagem para começar a composição.');
  } else if (!state.selectedProduct.imagem_local_url) {
    setStatus('Este produto ainda não possui uma imagem disponível para a arte.', true);
  } else if (!state.productImage) {
    setStatus('Carregando a imagem do produto...');
  } else if (compositionRequiresSecondaryProduct() && !state.secondaryProduct) {
    setStatus('Selecione o segundo produto para completar esta composição.');
  } else if (!secondaryProductReady) {
    setStatus('Carregando o segundo produto...');
  } else if (!detailsReady) {
    setStatus('Preparando as descrições da oferta...');
  } else if (!hasPrice()) {
    setStatus('Informe o preço para finalizar a arte.');
  } else if (isTwoProductsMode() && !hasPrice('details-secondary')) {
    setStatus('Informe o preço do segundo produto para finalizar a arte.');
  } else {
    setStatus('Arte pronta. Ajuste a imagem e o cartão separadamente ou baixe o PNG.');
  }
}

function loadImage(source) {
  if (!source) return Promise.reject(new Error('Imagem indisponível.'));
  if (state.imageCache.has(source)) return state.imageCache.get(source);

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar uma imagem da arte.'));
    image.src = source;
  });

  state.imageCache.set(source, promise);
  return promise;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getDetailsMeasureContext() {
  if (!detailsMeasureContext) {
    const measureCanvas = document.createElement('canvas');
    detailsMeasureContext = measureCanvas.getContext('2d');
  }
  return detailsMeasureContext;
}

function getProductImage(target = 'product') {
  return target === 'product-secondary' ? state.secondaryProductImage : state.productImage;
}

function getProductTransform(target = 'product') {
  return target === 'product-secondary' ? state.secondaryProductTransform : state.productTransform;
}

function setProductTransform(target, transform) {
  if (target === 'product-secondary') state.secondaryProductTransform = transform;
  else state.productTransform = transform;
}

function getDefaultProductWidth(target = 'product') {
  return target === 'product-secondary'
    ? state.defaultSecondaryProductWidth
    : state.defaultProductWidth;
}

function setDefaultProductWidth(target, width) {
  if (target === 'product-secondary') state.defaultSecondaryProductWidth = width;
  else state.defaultProductWidth = width;
}

function getProductAspectRatio(target = 'product') {
  const productImage = getProductImage(target);
  if (!productImage) return 1;
  return productImage.naturalWidth / productImage.naturalHeight;
}

function getProductWidthLimits(target = 'product') {
  const ratio = getProductAspectRatio(target);
  const absoluteMaximum = Math.min(STORY_WIDTH, (STORY_HEIGHT - STORY_SAFE_TOP) * ratio);
  return {
    minimum: Math.min(MIN_PRODUCT_WIDTH, absoluteMaximum),
    maximum: absoluteMaximum,
  };
}

function getProductBox(transform, target = 'product') {
  const productTransform = transform ?? getProductTransform(target);
  if (!productTransform || !getProductImage(target)) return null;
  return {
    x: productTransform.x,
    y: productTransform.y,
    width: productTransform.width,
    height: productTransform.width / getProductAspectRatio(target),
  };
}

function clampProductTransform(transform, target = 'product') {
  if (!getProductImage(target)) return null;

  const { minimum, maximum } = getProductWidthLimits(target);
  const width = clamp(transform.width, minimum, maximum);
  const height = width / getProductAspectRatio(target);
  return {
    x: clamp(transform.x, 0, STORY_WIDTH - width),
    y: clamp(transform.y, STORY_SAFE_TOP, STORY_HEIGHT - height),
    width,
  };
}

function getDetailsTransform(target = 'details') {
  return target === 'details-secondary'
    ? state.secondaryDetailsTransform
    : state.detailsTransform;
}

function setDetailsTransform(target, transform) {
  if (target === 'details-secondary') state.secondaryDetailsTransform = transform;
  else state.detailsTransform = transform;
}

function getDefaultDetailsWidth(target = 'details') {
  return target === 'details-secondary'
    ? state.defaultSecondaryDetailsWidth
    : state.defaultDetailsWidth;
}

function setDefaultDetailsWidth(target, width) {
  if (target === 'details-secondary') state.defaultSecondaryDetailsWidth = width;
  else state.defaultDetailsWidth = width;
}

function getOfferTitle(target = 'details') {
  return getDetailsProducts(target)
    .map((product) => product.nome)
    .filter(Boolean)
    .join(' + ');
}

function getOfferSupportingText(target = 'details') {
  const productDescriptions = getDetailsProducts(target)
    .map((product) => product.subtitulo || product.fabricante)
    .filter(Boolean);
  return productDescriptions.join(' + ') || 'Produto selecionado';
}

function getDetailsTextMetrics(
  availableWidth,
  cardPadding,
  nameFontSize,
  subtitleFontSize,
  target = 'details',
) {
  const measureContext = getDetailsMeasureContext();
  const textWidth = availableWidth - (cardPadding * 2);
  const productName = getOfferTitle(target);

  measureContext.font = `800 ${nameFontSize}px Arial, sans-serif`;
  const titleLines = productName ? wrapText(measureContext, productName, textWidth) : [''];
  const titleWidth = Math.max(0, ...titleLines.map((line) => measureContext.measureText(line).width));

  const supportingText = getOfferSupportingText(target);
  measureContext.font = `700 ${subtitleFontSize}px Arial, sans-serif`;
  const supportingLines = wrapText(measureContext, supportingText, textWidth);
  const supportingWidth = Math.max(
    0,
    ...supportingLines.map((line) => measureContext.measureText(line).width),
  );

  return {
    titleLines,
    titleWidth,
    supportingLines,
    supportingWidth,
  };
}

function getDetailsPriceMetrics(availableWidth, priceHeight, target = 'details') {
  const displayedPrice = hasPrice(target) ? getPriceForDetailsTarget(target) : '—';
  const currencyFontSize = priceHeight * 0.3;
  let priceFontSize = priceHeight * 0.56;
  const horizontalPadding = priceHeight * 0.3;
  const contentGap = priceHeight * 0.12;

  const measureContext = getDetailsMeasureContext();
  measureContext.font = `800 ${currencyFontSize}px Arial, sans-serif`;
  const currencyWidth = measureContext.measureText('R$').width;
  measureContext.font = `900 ${priceFontSize}px Arial, sans-serif`;
  let priceWidth = measureContext.measureText(displayedPrice).width;
  const maxPriceWidth = Math.max(
    1,
    availableWidth - (horizontalPadding * 2) - currencyWidth - contentGap,
  );

  if (priceWidth > maxPriceWidth) {
    priceFontSize *= maxPriceWidth / priceWidth;
    measureContext.font = `900 ${priceFontSize}px Arial, sans-serif`;
    priceWidth = measureContext.measureText(displayedPrice).width;
  }

  return {
    displayedPrice,
    currencyFontSize,
    priceFontSize,
    horizontalPadding,
    contentGap,
    currencyWidth,
    priceWidth,
    badgeWidth: Math.min(
      availableWidth,
      (horizontalPadding * 2) + currencyWidth + contentGap + priceWidth,
    ),
  };
}

function getDetailsLayout(transform, target = 'details') {
  transform = transform ?? getDetailsTransform(target);
  if (!transform) return null;

  const includesPrice = target === 'details' || (target === 'details-secondary' && isTwoProductsMode());
  const availableWidth = clamp(transform.width, MIN_DETAILS_WIDTH, STORY_WIDTH - 48);
  const cardPadding = DESCRIPTION_CARD_PADDING;
  const nameFontSize = clamp(availableWidth * 0.062, 20, 68);
  const lineHeight = nameFontSize * 1.1;
  const subtitleFontSize = clamp(availableWidth * 0.042, 14, 42);
  const subtitleLineHeight = subtitleFontSize * 1.22;
  const priceHeight = includesPrice ? clamp(availableWidth * 0.18, 64, 176) : 0;
  const priceGap = includesPrice ? clamp(availableWidth * 0.045, 16, 42) : 0;
  const detailGap = clamp(availableWidth * 0.012, 5, 12);
  const textMetrics = getDetailsTextMetrics(
    availableWidth,
    cardPadding,
    nameFontSize,
    subtitleFontSize,
    target,
  );
  const priceMetrics = includesPrice
    ? getDetailsPriceMetrics(availableWidth, priceHeight, target)
    : {
      displayedPrice: '',
      currencyFontSize: 0,
      priceFontSize: 0,
      horizontalPadding: 0,
      contentGap: 0,
      currencyWidth: 0,
      priceWidth: 0,
      badgeWidth: 0,
    };
  const titleLineCount = Math.max(1, textMetrics.titleLines.length);
  const supportingLineCount = Math.max(1, textMetrics.supportingLines.length);
  const descriptionHeight = cardPadding
    + nameFontSize
    + ((titleLineCount - 1) * lineHeight)
    + detailGap
    + subtitleFontSize
    + ((supportingLineCount - 1) * subtitleLineHeight)
    + cardPadding;
  const descriptionWidth = Math.min(
    availableWidth,
    Math.max(
      textMetrics.titleWidth + (cardPadding * 2),
      textMetrics.supportingWidth + (cardPadding * 2),
      includesPrice ? priceMetrics.badgeWidth : 0,
    ),
  );
  const descriptionX = transform.x + ((availableWidth - descriptionWidth) / 2);
  const cardHeight = descriptionHeight + priceGap + priceHeight;
  const priceY = includesPrice ? transform.y + descriptionHeight + priceGap : null;

  return {
    x: transform.x,
    y: transform.y,
    target,
    includesPrice,
    width: availableWidth,
    availableWidth,
    cardHeight,
    descriptionHeight,
    descriptionWidth,
    descriptionX,
    cardPadding,
    nameFontSize,
    lineHeight,
    subtitleFontSize,
    subtitleLineHeight,
    detailGap,
    titleLineCount,
    titleLines: textMetrics.titleLines,
    supportingLines: textMetrics.supportingLines,
    priceHeight,
    priceY,
    badgeX: includesPrice
      ? descriptionX + ((descriptionWidth - priceMetrics.badgeWidth) / 2)
      : null,
    ...priceMetrics,
  };
}

function getDetailsBox(transform, target = 'details') {
  const layout = getDetailsLayout(transform ?? getDetailsTransform(target), target);
  if (!layout) return null;
  return {
    x: layout.descriptionX,
    y: layout.y,
    width: layout.descriptionWidth,
    height: layout.cardHeight,
  };
}

function getDetailsWidthLimits() {
  return { minimum: MIN_DETAILS_WIDTH, maximum: STORY_WIDTH - 48 };
}

function clampDetailsTransform(transform, target = 'details') {
  const { minimum, maximum } = getDetailsWidthLimits();
  const width = clamp(transform.width, minimum, maximum);
  const layout = getDetailsLayout({ x: 0, y: 0, width }, target);
  const horizontalInset = (layout.width - layout.descriptionWidth) / 2;
  return {
    x: clamp(
      transform.x,
      -horizontalInset,
      STORY_WIDTH - layout.descriptionWidth - horizontalInset,
    ),
    y: clamp(transform.y, STORY_SAFE_TOP, STORY_HEIGHT - layout.cardHeight),
    width,
  };
}

function getDetailsTransformFromVisualBox(box, width, target = 'details') {
  const layout = getDetailsLayout({ x: 0, y: 0, width }, target);
  const horizontalInset = (layout.width - layout.descriptionWidth) / 2;
  return clampDetailsTransform({
    x: box.x - horizontalInset,
    y: box.y,
    width,
  }, target);
}

function getFreeTextWidthLimits() {
  return { minimum: MIN_FREE_TEXT_WIDTH, maximum: STORY_WIDTH - 48 };
}

function getTrackedTextWidth(context, text, letterSpacing) {
  const characterCount = Array.from(text).length;
  return context.measureText(text).width + Math.max(0, characterCount - 1) * letterSpacing;
}

function wrapTrackedText(context, text, maxWidth, letterSpacing) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const candidate = line ? line + ' ' + word : word;
    if (!line || getTrackedTextWidth(context, candidate, letterSpacing) <= maxWidth) {
      line = candidate;
      return;
    }
    lines.push(line);
    line = word;
  });

  if (line) lines.push(line);
  return lines;
}

function getFreeTextLayout(transform = state.freeTextTransform) {
  const text = state.freeText.trim().toUpperCase();
  if (!transform || !text) return null;

  const { minimum, maximum } = getFreeTextWidthLimits();
  const width = clamp(transform.width, minimum, maximum);
  const fontSize = clamp(width * 0.12, 40, 116);
  const lineHeight = fontSize * 0.92;
  const letterSpacing = fontSize * FREE_TEXT_LETTER_SPACING_RATIO;
  const measureContext = getDetailsMeasureContext();
  measureContext.font = 'italic 700 ' + fontSize + 'px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const lines = wrapTrackedText(measureContext, text, width, letterSpacing);
  const textWidth = Math.max(
    1,
    ...lines.map((line) => getTrackedTextWidth(measureContext, line, letterSpacing)),
  );

  return {
    x: transform.x,
    y: transform.y,
    width,
    height: Math.max(fontSize, lines.length * lineHeight),
    fontSize,
    lineHeight,
    letterSpacing,
    textWidth,
    lines,
  };
}

function getFreeTextBox(transform = state.freeTextTransform) {
  const layout = getFreeTextLayout(transform);
  if (!layout) return null;
  return {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
  };
}

function clampFreeTextTransform(transform) {
  if (!state.freeText.trim()) return null;
  const { minimum, maximum } = getFreeTextWidthLimits();
  const width = clamp(transform.width, minimum, maximum);
  const layout = getFreeTextLayout({ x: 0, y: 0, width });
  return {
    x: clamp(transform.x, 0, STORY_WIDTH - layout.width),
    y: clamp(transform.y, STORY_SAFE_TOP, STORY_HEIGHT - layout.height),
    width,
  };
}

function makeDefaultFreeTextTransform() {
  if (!state.freeText.trim()) return null;
  const { minimum, maximum } = getFreeTextWidthLimits();
  const width = clamp(DEFAULT_FREE_TEXT_WIDTH, minimum, maximum);
  const layout = getFreeTextLayout({ x: 0, y: 0, width });
  return clampFreeTextTransform({
    x: (STORY_WIDTH - layout.width) / 2,
    y: STORY_SAFE_TOP + 68,
    width,
  });
}

function resetFreeTextTransform() {
  state.freeTextTransform = makeDefaultFreeTextTransform();
  state.defaultFreeTextWidth = state.freeTextTransform?.width || null;
  syncProductEditor();
  schedulePreview();
}

function setFreeTextWidth(width, centerX, centerY) {
  if (!state.freeTextTransform || !state.freeText.trim()) return;
  const currentBox = getFreeTextBox();
  const nextCenterX = centerX ?? currentBox.x + (currentBox.width / 2);
  const nextCenterY = centerY ?? currentBox.y + (currentBox.height / 2);
  const nextLayout = getFreeTextLayout({ x: 0, y: 0, width });
  state.freeTextTransform = clampFreeTextTransform({
    x: nextCenterX - (nextLayout.width / 2),
    y: nextCenterY - (nextLayout.height / 2),
    width,
  });
}

function getDefaultProductArea(target = 'product') {
  return state.secondaryProductImage
    ? DEFAULT_TWO_PRODUCT_AREAS[target]
    : DEFAULT_PRODUCT_AREA;
}

function getAllProductBoxes() {
  return ['product', 'product-secondary']
    .map((target) => getProductBox(undefined, target))
    .filter(Boolean);
}

function makeDefaultProductTransform(target = 'product') {
  if (!getProductImage(target)) return null;

  const area = getDefaultProductArea(target);
  const ratio = getProductAspectRatio(target);
  const { minimum, maximum } = getProductWidthLimits(target);
  const width = clamp(
    Math.min(area.width, area.height * ratio),
    minimum,
    maximum,
  );
  const height = width / ratio;
  return clampProductTransform({
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
  }, target);
}

function makeDefaultDetailsTransform(target = 'details') {
  const { minimum, maximum } = getDetailsWidthLimits();
  if (isTwoProductsMode()) {
    const productTarget = target === 'details-secondary' ? 'product-secondary' : 'product';
    const productBox = getProductBox(undefined, productTarget);
    const productArea = DEFAULT_TWO_PRODUCT_AREAS[productTarget] || DEFAULT_PRODUCT_AREA;
    const width = clamp(Math.min(440, productArea.width), minimum, maximum);
    const provisionalLayout = getDetailsLayout({ x: 0, y: 0, width }, target);
    const centerX = productBox
      ? productBox.x + (productBox.width / 2)
      : productArea.x + (productArea.width / 2);
    const productBottom = productBox
      ? productBox.y + productBox.height
      : productArea.y + productArea.height;
    const desiredY = Math.max(1120, productBottom + 48);
    return getDetailsTransformFromVisualBox({
      x: centerX - (provisionalLayout.descriptionWidth / 2),
      y: Math.min(desiredY, STORY_HEIGHT - provisionalLayout.cardHeight - 56),
    }, width, target);
  }

  const width = clamp(DEFAULT_DETAILS_WIDTH, minimum, maximum);
  const productBottom = Math.max(
    0,
    ...getAllProductBoxes().map((productBox) => productBox.y + productBox.height),
  );
  const provisionalLayout = getDetailsLayout({ x: 0, y: 0, width }, target);
  const desiredY = Math.max(1120, productBottom + 64);
  return getDetailsTransformFromVisualBox({
    x: (STORY_WIDTH - provisionalLayout.descriptionWidth) / 2,
    y: Math.min(desiredY, STORY_HEIGHT - provisionalLayout.cardHeight - 56),
  }, width, target);
}

function resetProductTransform(target = 'product') {
  const productTransform = makeDefaultProductTransform(target);
  setProductTransform(target, productTransform);
  setDefaultProductWidth(target, productTransform?.width || null);
  syncProductEditor();
  schedulePreview();
}

function resetDetailsTransform(target = 'details') {
  const detailsTransform = makeDefaultDetailsTransform(target);
  setDetailsTransform(target, detailsTransform);
  setDefaultDetailsWidth(target, detailsTransform?.width || null);
  syncProductEditor();
  schedulePreview();
}

function setProductWidth(width, centerX, centerY, target = 'product') {
  if (!getProductTransform(target) || !getProductImage(target)) return;
  const currentBox = getProductBox(undefined, target);
  const nextCenterX = centerX ?? currentBox.x + currentBox.width / 2;
  const nextCenterY = centerY ?? currentBox.y + currentBox.height / 2;
  const height = width / getProductAspectRatio(target);
  setProductTransform(target, clampProductTransform({
    x: nextCenterX - width / 2,
    y: nextCenterY - height / 2,
    width,
  }, target));
}

function setDetailsWidth(width, centerX, centerY, target = 'details') {
  const detailsTransform = getDetailsTransform(target);
  if (!detailsTransform) return;
  const currentBox = getDetailsBox(undefined, target);
  const nextCenterX = centerX ?? currentBox.x + currentBox.width / 2;
  const nextCenterY = centerY ?? currentBox.y + currentBox.height / 2;
  const nextLayout = getDetailsLayout({ x: 0, y: 0, width }, target);
  setDetailsTransform(target, getDetailsTransformFromVisualBox({
    x: nextCenterX - (nextLayout.descriptionWidth / 2),
    y: nextCenterY - (nextLayout.cardHeight / 2),
  }, width, target));
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawImageCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function getBackgroundBadgeTheme(image) {
  const fallback = { fill: '#0e746c', text: '#ffffff' };
  if (!image) return fallback;

  try {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 72;
    sampleCanvas.height = 128;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    drawImageCover(sampleContext, image, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const { data } = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const colors = new Map();

    for (let index = 0; index < data.length; index += 16) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha < 200) continue;

      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
      const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
      if (saturation < 0.08 && luminance > 238) continue;

      const bucketRed = Math.round(red / 24) * 24;
      const bucketGreen = Math.round(green / 24) * 24;
      const bucketBlue = Math.round(blue / 24) * 24;
      const key = `${bucketRed},${bucketGreen},${bucketBlue}`;
      const weight = 1 + (saturation * 2) + (luminance > 36 && luminance < 230 ? 0.45 : 0);
      const entry = colors.get(key) || { red: 0, green: 0, blue: 0, weight: 0 };
      entry.red += red * weight;
      entry.green += green * weight;
      entry.blue += blue * weight;
      entry.weight += weight;
      colors.set(key, entry);
    }

    const dominant = [...colors.values()].sort((left, right) => right.weight - left.weight)[0];
    if (!dominant) return fallback;

    const red = Math.round(dominant.red / dominant.weight);
    const green = Math.round(dominant.green / dominant.weight);
    const blue = Math.round(dominant.blue / dominant.weight);
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    return {
      fill: `rgb(${red}, ${green}, ${blue})`,
      text: luminance > 155 ? '#0b2b33' : '#ffffff',
    };
  } catch {
    return fallback;
  }
}

function wrapText(context, text, maxWidth, maxLines = Infinity) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      if (context.measureText(word).width <= maxWidth) return [word];

      const fragments = [];
      let fragment = '';
      for (const character of word) {
        const candidate = fragment + character;
        if (fragment && context.measureText(candidate).width > maxWidth) {
          fragments.push(fragment);
          fragment = character;
        } else {
          fragment = candidate;
        }
      }
      if (fragment) fragments.push(fragment);
      return fragments;
    });
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }

    lines.push(line);
    line = word;
    if (Number.isFinite(maxLines) && lines.length === maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (
    Number.isFinite(maxLines)
    && words.length
    && lines.length === maxLines
    && lines.join(' ') !== words.join(' ')
  ) {
    let lastLine = lines.at(-1);
    while (lastLine.length > 1 && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${lastLine}…`;
  }
  return lines;
}

function drawDetailsCard(context, product, price, target = 'details') {
  if (!product?.nome || !getDetailsTransform(target)) return;

  const layout = getDetailsLayout(undefined, target);
  const {
    descriptionX,
    descriptionWidth,
    titleLines: lines,
    supportingLines,
  } = layout;

  context.save();
  context.shadowColor = 'rgba(7, 49, 48, 0.19)';
  context.shadowBlur = descriptionWidth * 0.045;
  context.shadowOffsetY = descriptionWidth * 0.026;
  context.fillStyle = '#ffffff';
  drawRoundedRect(
    context,
    descriptionX,
    layout.y,
    descriptionWidth,
    layout.descriptionHeight,
    Math.min(descriptionWidth * 0.055, descriptionWidth * 0.14),
  );
  context.fill();
  context.restore();

  context.save();
  context.fillStyle = '#0b2b33';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `800 ${layout.nameFontSize}px Arial, sans-serif`;
  const firstLineY = layout.y + layout.cardPadding + (layout.nameFontSize / 2);
  lines.forEach((line, index) => {
    context.fillText(line, descriptionX + (descriptionWidth / 2), firstLineY + (index * layout.lineHeight));
  });

  context.fillStyle = '#5f7379';
  context.font = `700 ${layout.subtitleFontSize}px Arial, sans-serif`;
  const supportingY = firstLineY
    + ((lines.length - 1) * layout.lineHeight)
    + (layout.nameFontSize / 2)
    + layout.detailGap
    + (layout.subtitleFontSize / 2);
  supportingLines.forEach((line, index) => {
    context.fillText(
      line,
      descriptionX + (descriptionWidth / 2),
      supportingY + (index * layout.subtitleLineHeight),
    );
  });
  context.restore();

  if (!layout.includesPrice) return;

  const displayedPrice = price || '—';
  const currencyFontSize = layout.priceHeight * 0.3;
  let priceFontSize = layout.priceHeight * 0.56;
  const horizontalPadding = layout.priceHeight * 0.3;
  const contentGap = layout.priceHeight * 0.12;
  const maxBadgeWidth = descriptionWidth;

  context.save();
  context.font = `800 ${currencyFontSize}px Arial, sans-serif`;
  const currencyWidth = context.measureText('R$').width;
  context.font = `900 ${priceFontSize}px Arial, sans-serif`;
  let priceWidth = context.measureText(displayedPrice).width;
  const maxPriceWidth = maxBadgeWidth - (horizontalPadding * 2) - currencyWidth - contentGap;
  if (priceWidth > maxPriceWidth) {
    priceFontSize *= maxPriceWidth / priceWidth;
    context.font = `900 ${priceFontSize}px Arial, sans-serif`;
    priceWidth = context.measureText(displayedPrice).width;
  }

  const badgeWidth = Math.min(
    maxBadgeWidth,
    (horizontalPadding * 2) + currencyWidth + contentGap + priceWidth,
  );
  const badgeX = descriptionX + ((descriptionWidth - badgeWidth) / 2);
  const badgeTheme = state.backgroundBadgeTheme || { fill: '#0e746c', text: '#ffffff' };
  context.fillStyle = price ? badgeTheme.fill : '#c9d5d2';
  drawRoundedRect(context, badgeX, layout.priceY, badgeWidth, layout.priceHeight, layout.priceHeight * 0.28);
  context.fill();

  context.fillStyle = price ? badgeTheme.text : '#ffffff';
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.font = `800 ${currencyFontSize}px Arial, sans-serif`;
  const currencyX = badgeX + horizontalPadding;
  context.fillText('R$', currencyX, layout.priceY + (layout.priceHeight / 2));
  context.font = `900 ${priceFontSize}px Arial, sans-serif`;
  context.fillText(
    displayedPrice,
    currencyX + currencyWidth + contentGap,
    layout.priceY + (layout.priceHeight / 2),
  );
  context.restore();
}

function drawFreeText(context) {
  const layout = getFreeTextLayout();
  if (!layout) return;

  context.save();
  context.font = 'italic 700 ' + layout.fontSize + 'px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = clamp(layout.fontSize * 0.055, 2, 7);
  context.strokeStyle = 'rgba(8, 43, 50, 0.48)';
  context.fillStyle = (state.backgroundBadgeTheme || { fill: '#0e746c' }).fill;
  context.shadowColor = 'rgba(6, 42, 46, 0.38)';
  context.shadowBlur = layout.fontSize * 0.12;
  context.shadowOffsetY = layout.fontSize * 0.055;

  const centerX = layout.x + (layout.width / 2);
  const firstLineY = layout.y + (layout.fontSize / 2);
  layout.lines.forEach((line, index) => {
    const lineY = firstLineY + (index * layout.lineHeight);
    let characterX = centerX - (getTrackedTextWidth(context, line, layout.letterSpacing) / 2);
    Array.from(line).forEach((character) => {
      context.strokeText(character, characterX, lineY);
      context.fillText(character, characterX, lineY);
      characterX += context.measureText(character).width + layout.letterSpacing;
    });
  });
  context.restore();
}

function drawPlaceholder(context) {
  context.save();
  context.fillStyle = '#e8f0ed';
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  context.fillStyle = '#0b2b33';
  context.font = '800 44px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText('Carregando background…', STORY_WIDTH / 2, STORY_HEIGHT / 2);
  context.restore();
}

function drawComposition(context) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  if (!state.backgroundImage) {
    drawPlaceholder(context);
    context.restore();
    return;
  }

  drawImageCover(context, state.backgroundImage, 0, 0, STORY_WIDTH, STORY_HEIGHT);

  ['product', 'product-secondary'].forEach((target) => {
    const productImage = getProductImage(target);
    const productBox = getProductBox(undefined, target);
    if (!productImage || !productBox) return;
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.drawImage(productImage, productBox.x, productBox.y, productBox.width, productBox.height);
    context.restore();
  });

  drawDetailsCard(context, state.selectedProduct, hasPrice() ? state.price : '', 'details');
  if (isTwoProductsMode()) {
    drawDetailsCard(
      context,
      state.secondaryProduct,
      hasPrice('details-secondary') ? state.secondaryPrice : '',
      'details-secondary',
    );
  }
  drawFreeText(context);

  context.restore();
}

function drawPreviewNow() {
  const context = elements.canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  drawComposition(context);
  syncProductEditor();
}

function schedulePreview() {
  if (state.animationFrame) return;
  state.animationFrame = requestAnimationFrame(() => {
    state.animationFrame = null;
    drawPreviewNow();
  });
}

function setPreviewZoom(value) {
  const minimum = Number(elements.zoom.min) || 70;
  const maximum = Number(elements.zoom.max) || 130;
  const step = Number(elements.zoom.step) || 5;
  const zoom = clamp(Math.round(Number(value) / step) * step, minimum, maximum);

  state.previewZoom = zoom;
  elements.zoom.value = String(zoom);
  elements.zoomOutput.value = `${zoom}%`;
  elements.zoomOutput.textContent = `${zoom}%`;
  elements.canvasWrap.style.setProperty('--story-preview-zoom', String(zoom / 100));
}

function setThirdsGridVisible(visible) {
  state.thirdsGridVisible = visible;
  elements.thirdsGrid.hidden = !visible;
  elements.thirdsGridToggle.classList.toggle('is-active', visible);
  elements.thirdsGridToggle.setAttribute('aria-pressed', String(visible));
  elements.thirdsGridToggle.setAttribute(
    'aria-label',
    visible ? 'Ocultar grade de terços' : 'Mostrar grade de terços',
  );
  elements.thirdsGridToggle.title = visible ? 'Ocultar grade de terços' : 'Mostrar grade de terços';
}

function createSecondaryDetailsSelection() {
  if (elements.secondaryDetailsSelection || !elements.detailsSelection) return;

  const selection = elements.detailsSelection.cloneNode(true);
  selection.id = 'story-secondary-details-selection';
  selection.dataset.editTarget = 'details-secondary';
  selection.hidden = true;
  selection.setAttribute(
    'aria-label',
    'Segunda descrição selecionada. Arraste para mover; arraste os cantos para redimensionar; use as setas do teclado para mover.',
  );
  elements.detailsSelection.after(selection);
  elements.secondaryDetailsSelection = selection;
}

function createSecondaryDetailsPositionControls() {
  if (elements.secondaryDetailsPositionSection || !elements.detailsPositionSection) return;

  const section = elements.detailsPositionSection.cloneNode(true);
  const heading = section.querySelector('.story-section-heading');
  const headingTitle = heading?.querySelector('h2');
  const headingDescription = heading?.querySelector('p');
  const scaleLabel = section.querySelector('label[for="story-details-scale"]');
  const scale = section.querySelector('#story-details-scale');
  const scaleOutput = section.querySelector('#story-details-scale-output');
  const center = section.querySelector('#center-details-button');
  const reset = section.querySelector('#reset-details-button');

  section.id = 'story-secondary-details-position-section';
  section.hidden = true;
  if (headingTitle) headingTitle.textContent = 'Ajuste a segunda descrição';
  if (headingDescription) headingDescription.textContent = 'Arraste ou redimensione a descrição do segundo produto na prévia.';
  if (scaleLabel) scaleLabel.htmlFor = 'story-secondary-details-scale';
  if (scale) scale.id = 'story-secondary-details-scale';
  if (scaleOutput) {
    scaleOutput.id = 'story-secondary-details-scale-output';
    scaleOutput.htmlFor = 'story-secondary-details-scale';
  }
  if (center) {
    center.id = 'center-secondary-details-button';
    center.textContent = 'Centralizar';
  }
  if (reset) {
    reset.id = 'reset-secondary-details-button';
    reset.textContent = 'Redefinir cartão';
  }

  elements.detailsPositionSection.after(section);
  elements.secondaryDetailsPositionSection = section;
  elements.secondaryDetailsScale = scale;
  elements.secondaryDetailsScaleOutput = scaleOutput;
  elements.centerSecondaryDetails = center;
  elements.resetSecondaryDetails = reset;
}

function ensureSecondaryDetailsControls() {
  createSecondaryDetailsSelection();
  createSecondaryDetailsPositionControls();
}

function syncSelection(selection, box, visible, target) {
  if (!selection) return;
  selection.hidden = !visible;
  selection.classList.toggle('is-active', visible && state.activeEditor === target);
  if (!visible) return;

  selection.style.left = `${(box.x / STORY_WIDTH) * 100}%`;
  selection.style.top = `${(box.y / STORY_HEIGHT) * 100}%`;
  selection.style.width = `${(box.width / STORY_WIDTH) * 100}%`;
  selection.style.height = `${(box.height / STORY_HEIGHT) * 100}%`;
}

function syncScaleControl(input, output, box, defaultWidth, limits, currentWidth = box.width) {
  const { minimum, maximum } = limits;
  const minimumPercent = Math.max(1, Math.round((minimum / defaultWidth) * 100));
  const maximumPercent = Math.max(minimumPercent, Math.round((maximum / defaultWidth) * 100));
  const currentPercent = clamp(Math.round((currentWidth / defaultWidth) * 100), minimumPercent, maximumPercent);
  input.min = String(minimumPercent);
  input.max = String(maximumPercent);
  input.value = String(currentPercent);
  output.value = `${currentPercent}%`;
  output.textContent = `${currentPercent}%`;
}

function syncPriceInputs() {
  const twoProducts = isTwoProductsMode();
  elements.primaryPriceLabel.textContent = twoProducts ? 'Preço do produto 1' : 'Preço da oferta';
  elements.secondaryPriceField.hidden = !twoProducts;
  elements.secondaryPriceLabel.textContent = 'Preço do produto 2';

  if (elements.price.value !== state.price) elements.price.value = state.price;
  if (elements.secondaryPrice.value !== state.secondaryPrice) {
    elements.secondaryPrice.value = state.secondaryPrice;
  }
}

function syncProductEditor() {
  const productBox = getProductBox();
  const secondaryProductBox = getProductBox(undefined, 'product-secondary');
  const detailsBox = getDetailsBox();
  const secondaryDetailsBox = getDetailsBox(undefined, 'details-secondary');
  const freeTextBox = getFreeTextBox();
  const productVisible = Boolean(productBox && state.selectedProduct);
  const secondaryProductVisible = Boolean(secondaryProductBox && state.secondaryProduct);
  const detailsVisible = Boolean(detailsBox && state.selectedProduct);
  const secondaryDetailsVisible = Boolean(
    isTwoProductsMode() && secondaryDetailsBox && state.secondaryProduct,
  );
  const freeTextVisible = Boolean(freeTextBox && state.freeText.trim());
  const anchorVisible = productVisible
    && detailsVisible
    && (!isTwoProductsMode() || (secondaryProductVisible && secondaryDetailsVisible));
  syncPriceInputs();
  elements.positionSection.hidden = !productVisible;
  elements.secondaryPositionSection.hidden = !secondaryProductVisible;
  elements.detailsPositionSection.hidden = !detailsVisible;
  if (elements.secondaryDetailsPositionSection) {
    elements.secondaryDetailsPositionSection.hidden = !secondaryDetailsVisible;
  }
  elements.freeTextPositionSection.hidden = !freeTextVisible;
  elements.anchorSection.hidden = !anchorVisible;
  elements.anchorToggle.checked = anchorVisible && state.elementsAnchored;
  syncSelection(elements.selection, productBox, productVisible, 'product');
  syncSelection(
    elements.secondarySelection,
    secondaryProductBox,
    secondaryProductVisible,
    'product-secondary',
  );
  syncSelection(elements.detailsSelection, detailsBox, detailsVisible, 'details');
  syncSelection(
    elements.secondaryDetailsSelection,
    secondaryDetailsBox,
    secondaryDetailsVisible,
    'details-secondary',
  );
  syncSelection(elements.freeTextSelection, freeTextBox, freeTextVisible, 'free-text');

  if (productVisible) {
    syncScaleControl(
      elements.scale,
      elements.scaleOutput,
      productBox,
      state.defaultProductWidth || productBox.width,
      getProductWidthLimits('product'),
    );
  }

  if (secondaryProductVisible) {
    syncScaleControl(
      elements.secondaryScale,
      elements.secondaryScaleOutput,
      secondaryProductBox,
      getDefaultProductWidth('product-secondary') || secondaryProductBox.width,
      getProductWidthLimits('product-secondary'),
    );
  }

  if (detailsVisible) {
    syncScaleControl(
      elements.detailsScale,
      elements.detailsScaleOutput,
      detailsBox,
      state.defaultDetailsWidth || state.detailsTransform.width,
      getDetailsWidthLimits(),
      state.detailsTransform.width,
    );
  }

  if (secondaryDetailsVisible && elements.secondaryDetailsScale) {
    syncScaleControl(
      elements.secondaryDetailsScale,
      elements.secondaryDetailsScaleOutput,
      secondaryDetailsBox,
      getDefaultDetailsWidth('details-secondary') || state.secondaryDetailsTransform.width,
      getDetailsWidthLimits(),
      state.secondaryDetailsTransform.width,
    );
  }

  if (freeTextVisible) {
    syncScaleControl(
      elements.freeTextScale,
      elements.freeTextScaleOutput,
      freeTextBox,
      state.defaultFreeTextWidth || state.freeTextTransform.width,
      getFreeTextWidthLimits(),
      state.freeTextTransform.width,
    );
  }
}

async function renderPreview() {
  const requestId = ++state.previewRequestId;
  const backgroundUrl = state.selectedBackground?.url || null;
  const productUrl = state.selectedProduct?.imagem_local_url || null;
  const secondaryProductUrl = state.secondaryProduct?.imagem_local_url || null;

  if (!backgroundUrl) {
    state.backgroundImage = null;
    state.backgroundImageUrl = null;
    state.backgroundBadgeTheme = null;
    state.productImage = null;
    state.productImageUrl = null;
    state.productTransform = null;
    state.defaultProductWidth = null;
    state.secondaryProductImage = null;
    state.secondaryProductImageUrl = null;
    state.secondaryProductTransform = null;
    state.defaultSecondaryProductWidth = null;
    state.detailsTransform = null;
    state.defaultDetailsWidth = null;
    state.secondaryDetailsTransform = null;
    state.defaultSecondaryDetailsWidth = null;
    state.elementsAnchored = false;
    drawPreviewNow();
    updateAvailability();
    return;
  }

  try {
    const [backgroundImage, productImage, secondaryProductImage] = await Promise.all([
      loadImage(backgroundUrl),
      productUrl ? loadImage(productUrl) : Promise.resolve(null),
      secondaryProductUrl ? loadImage(secondaryProductUrl) : Promise.resolve(null),
    ]);

    if (requestId !== state.previewRequestId) return;

    const backgroundChanged = backgroundUrl !== state.backgroundImageUrl;
    const productChanged = productUrl !== state.productImageUrl;
    const secondaryProductChanged = secondaryProductUrl !== state.secondaryProductImageUrl;
    state.backgroundImage = backgroundImage;
    state.backgroundImageUrl = backgroundUrl;
    if (backgroundChanged) state.backgroundBadgeTheme = getBackgroundBadgeTheme(backgroundImage);
    state.productImage = productImage;
    state.productImageUrl = productUrl;
    state.secondaryProductImage = secondaryProductImage;
    state.secondaryProductImageUrl = secondaryProductUrl;

    if (productChanged || secondaryProductChanged) {
      state.productTransform = null;
      state.defaultProductWidth = null;
      state.secondaryProductTransform = null;
      state.defaultSecondaryProductWidth = null;
      state.detailsTransform = null;
      state.defaultDetailsWidth = null;
      state.secondaryDetailsTransform = null;
      state.defaultSecondaryDetailsWidth = null;
      state.elementsAnchored = false;
      if (productImage) {
        resetProductTransform('product');
        if (secondaryProductImage) resetProductTransform('product-secondary');
        resetDetailsTransform();
        if (isTwoProductsMode() && secondaryProductImage) {
          resetDetailsTransform('details-secondary');
        }
      }
    }

    drawPreviewNow();
    updateAvailability();
  } catch (error) {
    if (requestId !== state.previewRequestId) return;
    elements.download.disabled = true;
    setStatus(error.message, true);
  }
}

function renderBackgrounds() {
  const options = state.backgrounds.map((background) => {
    const button = createElement('button', 'story-background-option');
    button.type = 'button';
    button.classList.toggle('is-selected', background.arquivo === state.selectedBackground?.arquivo);
    button.setAttribute('aria-pressed', String(background.arquivo === state.selectedBackground?.arquivo));
    button.setAttribute('aria-label', `Usar background ${background.nome}`);

    const image = new Image();
    image.alt = '';
    image.loading = 'lazy';
    image.src = background.url;
    button.append(image, createElement('span', null, background.nome));
    button.addEventListener('click', () => {
      state.selectedBackground = background;
      renderBackgrounds();
      renderPreview();
    });
    return button;
  });

  elements.backgrounds.replaceChildren(...options);
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function getProductSearchScore(product, query) {
  if (!query) return product.produto_destaque ? 0 : 10;

  const normalizedQuery = normalizeSearchText(query);
  const name = normalizeSearchText(product.nome);
  const ean = normalizeSearchText(product.ean);
  const manufacturer = normalizeSearchText(product.fabricante);
  const activeIngredient = normalizeSearchText(product.principio_ativo);
  const subtitle = normalizeSearchText(product.subtitulo);

  if (name === normalizedQuery || ean === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  if (manufacturer.startsWith(normalizedQuery) || activeIngredient.startsWith(normalizedQuery)) return 3;
  if (manufacturer.includes(normalizedQuery) || activeIngredient.includes(normalizedQuery)) return 4;
  if (subtitle.includes(normalizedQuery)) return 5;
  return 6;
}

function rankStoryProducts(products, query) {
  return [...products].sort((first, second) => {
    const scoreDifference = getProductSearchScore(first, query) - getProductSearchScore(second, query);
    if (scoreDifference !== 0) return scoreDifference;
    return String(first.nome || '').localeCompare(String(second.nome || ''), 'pt-BR');
  });
}

function getProductDescriptor(product) {
  const parts = [product.fabricante, product.subtitulo]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(' · ') || 'Produto disponível';
}

function getCompositionSelectionProgress() {
  const selectedCount = [state.selectedProduct, state.secondaryProduct].filter(Boolean).length;
  const requiredCount = getCompositionProductLimit();

  if (requiredCount === 1) {
    return selectedCount ? '1 produto selecionado' : 'Selecione 1 produto';
  }

  return `${Math.min(selectedCount, requiredCount)} de ${requiredCount} produtos selecionados`;
}

function updateProductSearchContext({ loading = false, loadingMore = false } = {}) {
  const query = elements.search.value.trim();
  const compositionProgress = getCompositionSelectionProgress();
  elements.clearSearch.hidden = !query;

  if (loading) {
    elements.productSearchSummary.textContent = `Buscando produtos… · ${compositionProgress}`;
    return;
  }

  if (loadingMore) {
    elements.productSearchSummary.textContent = `Carregando mais produtos… · ${compositionProgress}`;
    return;
  }

  const total = state.productTotal || 0;
  const visible = state.productResults.length;
  if (!query) {
    elements.productSearchSummary.textContent = visible
      ? `Exibindo ${visible} de ${total} produtos · ${compositionProgress}`
      : `Produtos em destaque · ${compositionProgress}`;
    return;
  }

  const resultLabel = total === 1 ? 'produto encontrado' : 'produtos encontrados';
  elements.productSearchSummary.textContent = `${visible} de ${total} ${resultLabel} para “${query}” · ${compositionProgress}`;
}

function clearProductSearch() {
  clearTimeout(searchTimer);
  elements.search.value = '';
  updateProductSearchContext();
  loadProducts();
  elements.search.focus();
}

function queueProductSearch() {
  clearTimeout(searchTimer);
  updateProductSearchContext({ loading: true });
  searchTimer = setTimeout(loadProducts, 180);
}

function syncCompositionModeControls() {
  elements.compositionModes.forEach((input) => {
    input.checked = normalizeCompositionMode(input.value) === state.compositionMode;
  });
}

function setCompositionMode(value) {
  const nextMode = normalizeCompositionMode(value);
  if (state.compositionMode === nextMode) {
    syncCompositionModeControls();
    return;
  }

  const previousMode = state.compositionMode;
  state.compositionMode = nextMode;
  if (getCompositionProductLimit() === 1) {
    state.secondaryProduct = null;
    state.secondaryPrice = '';
  } else if (nextMode === 'two-products' && previousMode !== 'two-products') {
    state.secondaryPrice = '';
  }
  resetProductCompositionState();
  syncCompositionModeControls();
  renderProducts();
  syncProductEditor();
  renderPreview();
}

function resetProductCompositionState() {
  state.productImage = null;
  state.productImageUrl = null;
  state.productTransform = null;
  state.defaultProductWidth = null;
  state.secondaryProductImage = null;
  state.secondaryProductImageUrl = null;
  state.secondaryProductTransform = null;
  state.defaultSecondaryProductWidth = null;
  state.detailsTransform = null;
  state.defaultDetailsWidth = null;
  state.secondaryDetailsTransform = null;
  state.defaultSecondaryDetailsWidth = null;
  state.elementsAnchored = false;
  state.activeEditor = null;
}

function clearSelectedProduct() {
  state.selectedProduct = null;
  state.secondaryProduct = null;
  state.secondaryPrice = '';
  resetProductCompositionState();
  syncProductEditor();
}

function selectProductForComposition(product) {
  if (product.id === state.selectedProduct?.id) {
    if (state.secondaryProduct) {
      state.selectedProduct = state.secondaryProduct;
      state.price = state.secondaryPrice;
      state.secondaryProduct = null;
      state.secondaryPrice = '';
    } else {
      state.selectedProduct = null;
    }
  } else if (product.id === state.secondaryProduct?.id) {
    state.secondaryProduct = null;
    state.secondaryPrice = '';
  } else if (!state.selectedProduct) {
    state.selectedProduct = product;
  } else if (getCompositionProductLimit() === 1) {
    state.selectedProduct = product;
  } else {
    state.secondaryProduct = product;
    state.secondaryPrice = '';
  }

  resetProductCompositionState();
  renderProducts();
  renderPreview();
}

function addProductToResults(product) {
  const productsById = new Map(state.productResults.map((item) => [item.id, item]));
  productsById.set(product.id, product);
  state.productResults = rankStoryProducts([...productsById.values()], elements.search.value.trim());
}

async function preselectProductFromLocation() {
  const productId = getPreselectedProductId();
  if (!productId) return false;

  try {
    const product = await requestJson(`/api/products/${productId}`);
    const isExpectedProduct = Number.isSafeInteger(product?.id) && product.id === productId;
    if (!isExpectedProduct) return false;

    state.selectedProduct = product;
    state.secondaryProduct = null;
    resetProductCompositionState();
    addProductToResults(product);
    renderProducts();
    return true;
  } catch {
    // An invalid, missing, or inaccessible product keeps the editor in its regular empty state.
    return false;
  }
}

function renderProducts() {
  updateProductSearchContext({
    loading: state.productLoading && !state.productResults.length,
    loadingMore: state.productLoading && Boolean(state.productResults.length),
  });
  const query = elements.search.value.trim();
  if (!state.productResults.length) {
    if (state.productLoading) {
      elements.products.replaceChildren(createElement('p', 'story-results-loading', 'Buscando produtos…'));
      return;
    }
    const message = query
      ? `Nenhum produto com imagem encontrado para “${query}”.`
      : 'Nenhum produto com imagem está disponível agora.';
    elements.products.replaceChildren(createElement('p', 'story-results-empty', message));
    return;
  }

  const cards = state.productResults.map((product) => {
    const button = createElement('button', 'story-product-option');
    button.type = 'button';
    const isPrimaryProduct = product.id === state.selectedProduct?.id;
    const isSecondaryProduct = product.id === state.secondaryProduct?.id;
    button.classList.toggle('is-selected', isPrimaryProduct);
    button.classList.toggle('is-secondary-selected', isSecondaryProduct);
    button.setAttribute('aria-pressed', String(isPrimaryProduct || isSecondaryProduct));
    button.setAttribute(
      'aria-label',
      isPrimaryProduct
        ? `${product.nome}, primeiro produto selecionado`
        : isSecondaryProduct
          ? `${product.nome}, segundo produto selecionado`
          : `Adicionar ${product.nome}`,
    );

    const imageWrap = createElement('span', 'story-product-option-image');
    if (product.imagem_local_url) {
      const image = new Image();
      image.alt = '';
      image.loading = 'lazy';
      image.src = product.imagem_local_url;
      imageWrap.append(image);
    } else {
      imageWrap.append(createElement('span', 'story-product-option-placeholder', 'Sem imagem'));
    }

    const copy = createElement('span', 'story-product-option-copy');
    copy.append(
      createElement('strong', null, product.nome),
      createElement('small', null, getProductDescriptor(product)),
    );

    button.append(imageWrap, copy);
    button.addEventListener('click', () => selectProductForComposition(product));
    return button;
  });

  const progress = createElement('p', 'story-results-progress');
  progress.setAttribute('aria-live', 'polite');
  if (state.productLoading) progress.textContent = 'Carregando mais produtos…';
  else if (state.productHasMore) progress.textContent = 'Role para carregar mais produtos';
  else progress.textContent = 'Todos os produtos foram exibidos';
  elements.products.replaceChildren(...cards, progress);
}

async function loadBackgrounds() {
  if (state.backgroundRequest) return state.backgroundRequest;

  state.backgroundRequest = requestJson('/api/story-backgrounds')
    .then((response) => {
      state.backgrounds = response.items || [];
      state.selectedBackground = state.backgrounds[0] || null;
      renderBackgrounds();
      return state.backgrounds;
    })
    .catch((error) => {
      elements.backgrounds.replaceChildren(createElement('p', 'story-results-empty', error.message));
      setStatus(error.message, true);
      throw error;
    });

  return state.backgroundRequest;
}

async function loadProducts({ append = false } = {}) {
  const query = elements.search.value.trim();
  if (append) {
    if (state.productLoading || !state.productHasMore || state.productQuery !== query) return;
  } else {
    state.productSearchController?.abort();
    state.productPage = 0;
    state.productHasMore = true;
    state.productTotal = 0;
    state.productResults = [];
    state.productQuery = query;
    elements.products.scrollTop = 0;
  }

  const requestId = ++state.productRequestId;
  const controller = new AbortController();
  state.productSearchController = controller;
  const page = append ? state.productPage + 1 : 1;
  const parameters = new URLSearchParams({
    imagem: 'com',
    status: 'ativo',
    page: String(page),
    pageSize: String(PRODUCT_PAGE_SIZE),
  });
  if (query) parameters.set('q', query);

  state.productLoading = true;
  renderProducts();
  try {
    const response = await requestJson(`/api/products?${parameters.toString()}`, { signal: controller.signal });
    if (requestId !== state.productRequestId) return;
    const incomingProducts = response.items || [];
    const productsById = new Map(state.productResults.map((product) => [product.id, product]));
    incomingProducts.forEach((product) => productsById.set(product.id, product));
    state.productTotal = response.pagination?.total || 0;
    state.productPage = response.pagination?.page || page;
    state.productHasMore = state.productPage < (response.pagination?.totalPages || 1);
    state.productResults = rankStoryProducts([...productsById.values()], query);
    state.productLoading = false;
    renderProducts();
  } catch (error) {
    if (requestId !== state.productRequestId) return;
    if (error.name === 'AbortError') return;
    state.productLoading = false;
    if (!append) {
      state.productTotal = 0;
      state.productResults = [];
      updateProductSearchContext();
      elements.products.replaceChildren(createElement('p', 'story-results-empty', error.message));
    } else {
      state.productHasMore = false;
      renderProducts();
    }
  } finally {
    if (state.productSearchController === controller) {
      state.productSearchController = null;
      state.productLoading = false;
    }
  }
}

function loadMoreProductsOnScroll() {
  const remainingScroll = elements.products.scrollHeight
    - elements.products.scrollTop
    - elements.products.clientHeight;
  if (remainingScroll > 120) return;
  loadProducts({ append: true });
}

function artPointFromEvent(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * STORY_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * STORY_HEIGHT,
  };
}

function getEditorTransform(target) {
  if (target === 'details' || target === 'details-secondary') return getDetailsTransform(target);
  if (target === 'free-text') return state.freeTextTransform;
  return getProductTransform(target);
}

function getEditorBox(target, transform) {
  if (target === 'details' || target === 'details-secondary') {
    return getDetailsBox(transform, target);
  }
  if (target === 'free-text') return getFreeTextBox(transform);
  return getProductBox(transform, target);
}

function getEditorWidthLimits(target) {
  if (target === 'details' || target === 'details-secondary') return getDetailsWidthLimits();
  if (target === 'free-text') return getFreeTextWidthLimits();
  return getProductWidthLimits(target);
}

function clampEditorTransform(target, transform) {
  if (target === 'details' || target === 'details-secondary') {
    return clampDetailsTransform(transform, target);
  }
  if (target === 'free-text') return clampFreeTextTransform(transform);
  return clampProductTransform(transform, target);
}

function setEditorTransform(target, transform) {
  if (target === 'details' || target === 'details-secondary') {
    setDetailsTransform(target, transform);
  }
  else if (target === 'free-text') state.freeTextTransform = transform;
  else setProductTransform(target, transform);
}

function getEditorSelection(target) {
  if (target === 'details') return elements.detailsSelection;
  if (target === 'details-secondary') return elements.secondaryDetailsSelection;
  if (target === 'free-text') return elements.freeTextSelection;
  return target === 'product-secondary' ? elements.secondarySelection : elements.selection;
}

function setActiveEditor(target = null) {
  if (state.activeEditor === target) return;
  state.activeEditor = target;
  syncProductEditor();
}

function getAnchoredEditorTargets() {
  const targets = ['product', 'details'];
  if (state.secondaryProductTransform) targets.push('product-secondary');
  if (isTwoProductsMode() && state.secondaryDetailsTransform) {
    targets.push('details-secondary');
  }
  return targets;
}

function hasAnchoredEditors() {
  return Boolean(
    state.elementsAnchored
      && getAnchoredEditorTargets().every((target) => getEditorTransform(target)),
  );
}

function getClampedEditorMovement(target, transform, horizontal, vertical) {
  const nextTransform = clampEditorTransform(target, {
    x: transform.x + horizontal,
    y: transform.y + vertical,
    width: transform.width,
  });
  return {
    horizontal: nextTransform.x - transform.x,
    vertical: nextTransform.y - transform.y,
  };
}

function getSharedAxisMovement(requestedMovement, movements) {
  if (requestedMovement === 0) return 0;
  return requestedMovement > 0
    ? Math.min(...movements)
    : Math.max(...movements);
}

function moveAnchoredEditorsBy(horizontal, vertical, transforms = {}) {
  const targets = getAnchoredEditorTargets();
  const sourceTransforms = targets.map((target) => ({
    target,
    transform: transforms[target] || getEditorTransform(target),
  }));
  if (sourceTransforms.some(({ transform }) => !transform)) return false;

  const movements = sourceTransforms.map(({ target, transform }) => ({
    target,
    transform,
    movement: getClampedEditorMovement(target, transform, horizontal, vertical),
  }));
  const sharedHorizontal = getSharedAxisMovement(
    horizontal,
    movements.map(({ movement }) => movement.horizontal),
  );
  const sharedVertical = getSharedAxisMovement(
    vertical,
    movements.map(({ movement }) => movement.vertical),
  );

  sourceTransforms.forEach(({ target, transform }) => {
    setEditorTransform(target, clampEditorTransform(target, {
      x: transform.x + sharedHorizontal,
      y: transform.y + sharedVertical,
      width: transform.width,
    }));
  });
  return true;
}

function getDetailsVisualWidthLimits(target = 'details') {
  const { minimum, maximum } = getDetailsWidthLimits();
  const minimumWidth = getDetailsLayout({ x: 0, y: 0, width: minimum }, target).descriptionWidth;
  const maximumWidth = getDetailsLayout({ x: 0, y: 0, width: maximum }, target).descriptionWidth;
  return {
    minimum: Math.min(minimumWidth, maximumWidth),
    maximum: Math.max(minimumWidth, maximumWidth),
  };
}

function getDetailsLogicalWidthForVisualWidth(visualWidth, target = 'details') {
  const { minimum, maximum } = getDetailsWidthLimits();
  const visualLimits = getDetailsVisualWidthLimits(target);
  const targetWidth = clamp(visualWidth, visualLimits.minimum, visualLimits.maximum);
  let lowerWidth = minimum;
  let upperWidth = maximum;

  for (let step = 0; step < 24; step += 1) {
    const middleWidth = (lowerWidth + upperWidth) / 2;
    const middleLayout = getDetailsLayout({ x: 0, y: 0, width: middleWidth }, target);
    if (middleLayout.descriptionWidth < targetWidth) lowerWidth = middleWidth;
    else upperWidth = middleWidth;
  }

  const lowerLayout = getDetailsLayout({ x: 0, y: 0, width: lowerWidth }, target);
  const upperLayout = getDetailsLayout({ x: 0, y: 0, width: upperWidth }, target);
  return Math.abs(lowerLayout.descriptionWidth - targetWidth)
    <= Math.abs(upperLayout.descriptionWidth - targetWidth)
    ? lowerWidth
    : upperWidth;
}

function transformDetailsFromResizeGesture(handle, point, startTransform, target = 'details') {
  const startBox = getDetailsBox(startTransform, target);
  if (!startBox) return startTransform;

  const ratio = startBox.width / startBox.height;
  const corners = {
    nw: { anchorX: startBox.x + startBox.width, anchorY: startBox.y + startBox.height, signX: -1, signY: -1 },
    ne: { anchorX: startBox.x, anchorY: startBox.y + startBox.height, signX: 1, signY: -1 },
    sw: { anchorX: startBox.x + startBox.width, anchorY: startBox.y, signX: -1, signY: 1 },
    se: { anchorX: startBox.x, anchorY: startBox.y, signX: 1, signY: 1 },
  };
  const corner = corners[handle];
  const horizontal = point.x - corner.anchorX;
  const vertical = point.y - corner.anchorY;
  const requestedWidth = (
    (corner.signX * horizontal) + ((corner.signY * vertical) / ratio)
  ) / (1 + (1 / (ratio * ratio)));
  const logicalWidth = getDetailsLogicalWidthForVisualWidth(requestedWidth, target);
  const nextLayout = getDetailsLayout({ x: 0, y: 0, width: logicalWidth }, target);

  return getDetailsTransformFromVisualBox({
    x: corner.signX > 0 ? corner.anchorX : corner.anchorX - nextLayout.descriptionWidth,
    y: corner.signY > 0 ? corner.anchorY : corner.anchorY - nextLayout.cardHeight,
  }, logicalWidth, target);
}

function transformFreeTextFromResizeGesture(handle, point, startTransform) {
  const startBox = getFreeTextBox(startTransform);
  if (!startBox) return startTransform;

  const ratio = startBox.width / startBox.height;
  const corners = {
    nw: { anchorX: startBox.x + startBox.width, anchorY: startBox.y + startBox.height, signX: -1, signY: -1 },
    ne: { anchorX: startBox.x, anchorY: startBox.y + startBox.height, signX: 1, signY: -1 },
    sw: { anchorX: startBox.x + startBox.width, anchorY: startBox.y, signX: -1, signY: 1 },
    se: { anchorX: startBox.x, anchorY: startBox.y, signX: 1, signY: 1 },
  };
  const corner = corners[handle];
  const horizontal = point.x - corner.anchorX;
  const vertical = point.y - corner.anchorY;
  const requestedWidth = (
    (corner.signX * horizontal) + ((corner.signY * vertical) / ratio)
  ) / (1 + (1 / (ratio * ratio)));
  const { minimum, maximum } = getFreeTextWidthLimits();
  const width = clamp(requestedWidth, minimum, maximum);
  const layout = getFreeTextLayout({ x: 0, y: 0, width });

  return clampFreeTextTransform({
    x: corner.signX > 0 ? corner.anchorX : corner.anchorX - layout.width,
    y: corner.signY > 0 ? corner.anchorY : corner.anchorY - layout.height,
    width,
  });
}

function transformFromResizeGesture(target, handle, point, startTransform) {
  if (target === 'details' || target === 'details-secondary') {
    return transformDetailsFromResizeGesture(handle, point, startTransform, target);
  }
  if (target === 'free-text') {
    return transformFreeTextFromResizeGesture(handle, point, startTransform);
  }

  const startBox = getEditorBox(target, startTransform);
  const ratio = startBox.width / startBox.height;
  const corners = {
    nw: { anchorX: startBox.x + startBox.width, anchorY: startBox.y + startBox.height, signX: -1, signY: -1 },
    ne: { anchorX: startBox.x, anchorY: startBox.y + startBox.height, signX: 1, signY: -1 },
    sw: { anchorX: startBox.x + startBox.width, anchorY: startBox.y, signX: -1, signY: 1 },
    se: { anchorX: startBox.x, anchorY: startBox.y, signX: 1, signY: 1 },
  };
  const corner = corners[handle];
  const horizontal = point.x - corner.anchorX;
  const vertical = point.y - corner.anchorY;
  const width = (
    (corner.signX * horizontal) + ((corner.signY * vertical) / ratio)
  ) / (1 + (1 / (ratio * ratio)));
  const { minimum, maximum } = getEditorWidthLimits(target);
  const nextWidth = clamp(width, minimum, maximum);
  const nextHeight = nextWidth / ratio;

  return clampEditorTransform(target, {
    x: corner.signX > 0 ? corner.anchorX : corner.anchorX - nextWidth,
    y: corner.signY > 0 ? corner.anchorY : corner.anchorY - nextHeight,
    width: nextWidth,
  });
}

function beginGesture(event) {
  const target = event.currentTarget.dataset.editTarget;
  const transform = getEditorTransform(target);
  if (!transform || event.button !== 0) return;

  setActiveEditor(target);
  const handle = event.target.closest('[data-resize-handle]')?.dataset.resizeHandle || null;
  const linkedStartTransforms = !handle && hasAnchoredEditors()
    ? Object.fromEntries(
      getAnchoredEditorTargets()
        .filter((editorTarget) => editorTarget !== target)
        .map((editorTarget) => [editorTarget, { ...getEditorTransform(editorTarget) }]),
    )
    : null;
  state.gesture = {
    pointerId: event.pointerId,
    target,
    type: handle ? 'resize' : 'move',
    handle,
    startPoint: artPointFromEvent(event),
    startTransform: { ...transform },
    linkedStartTransforms,
  };
  const selection = getEditorSelection(target);
  selection.setPointerCapture(event.pointerId);
  selection.classList.add('is-dragging');
  selection.focus({ preventScroll: true });
  event.preventDefault();
}

function moveGesture(event) {
  const gesture = state.gesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;

  const point = artPointFromEvent(event);
  if (gesture.type === 'move') {
    const horizontal = point.x - gesture.startPoint.x;
    const vertical = point.y - gesture.startPoint.y;
    if (gesture.linkedStartTransforms) {
      moveAnchoredEditorsBy(horizontal, vertical, {
        ...gesture.linkedStartTransforms,
        [gesture.target]: gesture.startTransform,
      });
    } else {
      setEditorTransform(gesture.target, clampEditorTransform(gesture.target, {
        x: gesture.startTransform.x + horizontal,
        y: gesture.startTransform.y + vertical,
        width: gesture.startTransform.width,
      }));
    }
  } else {
    setEditorTransform(
      gesture.target,
      transformFromResizeGesture(gesture.target, gesture.handle, point, gesture.startTransform),
    );
  }

  schedulePreview();
  event.preventDefault();
}

function finishGesture(event) {
  if (!state.gesture || (event && state.gesture.pointerId !== event.pointerId)) return;
  const selection = getEditorSelection(state.gesture.target);
  state.gesture = null;
  selection.classList.remove('is-dragging');
  syncProductEditor();
  updateAvailability();
}

function moveEditorBy(target, horizontal, vertical) {
  const transform = getEditorTransform(target);
  if (!transform) return;
  if (hasAnchoredEditors()) {
    moveAnchoredEditorsBy(horizontal, vertical);
  } else {
    setEditorTransform(target, clampEditorTransform(target, {
      x: transform.x + horizontal,
      y: transform.y + vertical,
      width: transform.width,
    }));
  }
  schedulePreview();
  updateAvailability();
}

function resizeEditorByPercentage(target, percentage) {
  const transform = getEditorTransform(target);
  const defaultWidth = (target === 'details' || target === 'details-secondary')
    ? getDefaultDetailsWidth(target)
    : target === 'free-text'
      ? state.defaultFreeTextWidth
      : getDefaultProductWidth(target);
  if (!transform || !defaultWidth) return;
  const box = getEditorBox(target);
  const nextWidth = (defaultWidth * percentage) / 100;
  if (target === 'details' || target === 'details-secondary') {
    setDetailsWidth(nextWidth, box.x + box.width / 2, box.y + box.height / 2, target);
  }
  else if (target === 'free-text') {
    setFreeTextWidth(nextWidth, box.x + box.width / 2, box.y + box.height / 2);
  }
  else setProductWidth(nextWidth, box.x + box.width / 2, box.y + box.height / 2, target);
  syncProductEditor();
  schedulePreview();
}

function centerEditor(target) {
  const box = getEditorBox(target);
  if (!box) return;

  if (hasAnchoredEditors()) {
    moveAnchoredEditorsBy(
      (STORY_WIDTH / 2) - (box.x + (box.width / 2)),
      (STORY_HEIGHT / 2) - (box.y + (box.height / 2)),
    );
    syncProductEditor();
    schedulePreview();
    return;
  }

  if (target === 'details' || target === 'details-secondary') {
    setDetailsWidth(
      getDetailsTransform(target).width,
      STORY_WIDTH / 2,
      STORY_HEIGHT / 2,
      target,
    );
    syncProductEditor();
    schedulePreview();
    return;
  }

  if (target === 'free-text') {
    setFreeTextWidth(state.freeTextTransform.width, STORY_WIDTH / 2, STORY_HEIGHT / 2);
    syncProductEditor();
    schedulePreview();
    return;
  }

  setEditorTransform(target, clampEditorTransform(target, {
    x: (STORY_WIDTH - box.width) / 2,
    y: (STORY_HEIGHT - box.height) / 2,
    width: box.width,
  }));
  syncProductEditor();
  schedulePreview();
}

function updateDownloadLabel(label) {
  if (elements.downloadLabel) elements.downloadLabel.textContent = label;
  else elements.download.textContent = label;
}

function downloadStory() {
  if (elements.download.disabled) {
    updateAvailability();
    return;
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = STORY_WIDTH;
  exportCanvas.height = STORY_HEIGHT;
  const context = exportCanvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  drawComposition(context);

  elements.download.disabled = true;
  updateDownloadLabel('Preparando PNG…');
  exportCanvas.toBlob((blob) => {
    updateDownloadLabel('Baixar PNG');
    updateAvailability();
    if (!blob) {
      setStatus('Não foi possível gerar o PNG. Tente novamente.', true);
      return;
    }

    const safeName = state.selectedProduct.nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'produto';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `story-${safeName}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('PNG pronto. A arte foi baixada para o seu dispositivo.');
  }, 'image/png');
}

function getScaleInputForEditorTarget(target) {
  if (target === 'details-secondary') return elements.secondaryDetailsScale;
  if (target === 'details') return elements.detailsScale;
  if (target === 'product-secondary') return elements.secondaryScale;
  if (target === 'free-text') return elements.freeTextScale;
  return elements.scale;
}

function handleSelectionKeydown(event) {
  const target = event.currentTarget.dataset.editTarget;
  if (!getEditorTransform(target)) return;
  const moveStep = event.shiftKey ? 20 : 5;

  if (event.key === 'ArrowLeft') moveEditorBy(target, -moveStep, 0);
  else if (event.key === 'ArrowRight') moveEditorBy(target, moveStep, 0);
  else if (event.key === 'ArrowUp') moveEditorBy(target, 0, -moveStep);
  else if (event.key === 'ArrowDown') moveEditorBy(target, 0, moveStep);
  else if (event.key === '+' || event.key === '=') {
    const input = getScaleInputForEditorTarget(target);
    resizeEditorByPercentage(target, Number(input?.value || 100) + 5);
  } else if (event.key === '-' || event.key === '_') {
    const input = getScaleInputForEditorTarget(target);
    resizeEditorByPercentage(target, Number(input?.value || 100) - 5);
  } else if (event.key === 'Escape' && state.gesture) {
    const gesture = state.gesture;
    setEditorTransform(gesture.target, gesture.startTransform);
    Object.entries(gesture.linkedStartTransforms || {}).forEach(([linkedTarget, transform]) => {
      setEditorTransform(linkedTarget, transform);
    });
    finishGesture();
    schedulePreview();
  } else {
    return;
  }

  event.preventDefault();
}

function bindSelectionEvents(selection) {
  if (!selection || selection.dataset.storyEditorBound === 'true') return;
  selection.dataset.storyEditorBound = 'true';
  selection.addEventListener('pointerdown', beginGesture);
  selection.addEventListener('pointermove', moveGesture);
  selection.addEventListener('pointerup', finishGesture);
  selection.addEventListener('pointercancel', finishGesture);
  selection.addEventListener('lostpointercapture', finishGesture);
  selection.addEventListener('keydown', handleSelectionKeydown);
}

function bindSecondaryDetailsPositionControls() {
  if (!elements.secondaryDetailsPositionSection) return;
  if (elements.secondaryDetailsPositionSection.dataset.storyEditorBound === 'true') return;
  elements.secondaryDetailsPositionSection.dataset.storyEditorBound = 'true';

  elements.secondaryDetailsScale?.addEventListener('input', () => {
    resizeEditorByPercentage('details-secondary', Number(elements.secondaryDetailsScale.value));
  });
  elements.centerSecondaryDetails?.addEventListener('click', () => centerEditor('details-secondary'));
  elements.resetSecondaryDetails?.addEventListener('click', () => {
    resetDetailsTransform('details-secondary');
  });
}

function bindEvents() {
  ensureSecondaryDetailsControls();
  const activeMode = elements.compositionModes.find((input) => input.checked);
  state.compositionMode = normalizeCompositionMode(activeMode?.value);
  syncCompositionModeControls();
  elements.compositionModes.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) setCompositionMode(input.value);
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('[data-edit-target]')) return;
    setActiveEditor();
  });

  elements.search.addEventListener('input', () => {
    queueProductSearch();
  });
  elements.search.addEventListener('search', queueProductSearch);
  elements.search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !elements.search.value) return;
    event.preventDefault();
    clearProductSearch();
  });
  elements.clearSearch.addEventListener('click', clearProductSearch);
  elements.products.addEventListener('scroll', loadMoreProductsOnScroll, { passive: true });

  elements.price.addEventListener('input', () => {
    const typedValue = elements.price.value.replace(/[^\d,.-]/g, '');
    elements.price.value = typedValue;
    state.price = typedValue;
    schedulePreview();
    updateAvailability();
  });

  elements.price.addEventListener('blur', () => {
    const formatted = formatPrice(elements.price.value);
    state.price = formatted;
    elements.price.value = formatted;
    schedulePreview();
    updateAvailability();
  });

  elements.secondaryPrice.addEventListener('input', () => {
    const typedValue = elements.secondaryPrice.value.replace(/[^\d,.-]/g, '');
    elements.secondaryPrice.value = typedValue;
    state.secondaryPrice = typedValue;
    schedulePreview();
    updateAvailability();
  });

  elements.secondaryPrice.addEventListener('blur', () => {
    const formatted = formatPrice(elements.secondaryPrice.value);
    state.secondaryPrice = formatted;
    elements.secondaryPrice.value = formatted;
    schedulePreview();
    updateAvailability();
  });

  elements.freeText.addEventListener('input', () => {
    state.freeText = elements.freeText.value.trim();
    if (!state.freeText) {
      state.freeTextTransform = null;
      state.defaultFreeTextWidth = null;
      if (state.activeEditor === 'free-text') state.activeEditor = null;
      syncProductEditor();
      schedulePreview();
      return;
    }

    if (!state.freeTextTransform) {
      resetFreeTextTransform();
      return;
    }

    state.freeTextTransform = clampFreeTextTransform(state.freeTextTransform);
    syncProductEditor();
    schedulePreview();
  });

  elements.anchorToggle.addEventListener('change', () => {
    state.elementsAnchored = elements.anchorToggle.checked
      && getAnchoredEditorTargets().every((target) => getEditorTransform(target));
    syncProductEditor();
  });

  [
    elements.selection,
    elements.secondarySelection,
    elements.detailsSelection,
    elements.secondaryDetailsSelection,
    elements.freeTextSelection,
  ].forEach(bindSelectionEvents);

  elements.scale.addEventListener('input', () => resizeEditorByPercentage('product', Number(elements.scale.value)));
  elements.centerProduct.addEventListener('click', () => centerEditor('product'));
  elements.resetProduct.addEventListener('click', resetProductTransform);
  elements.secondaryScale.addEventListener(
    'input',
    () => resizeEditorByPercentage('product-secondary', Number(elements.secondaryScale.value)),
  );
  elements.centerSecondaryProduct.addEventListener('click', () => centerEditor('product-secondary'));
  elements.resetSecondaryProduct.addEventListener(
    'click',
    () => resetProductTransform('product-secondary'),
  );
  elements.detailsScale.addEventListener('input', () => resizeEditorByPercentage('details', Number(elements.detailsScale.value)));
  elements.centerDetails.addEventListener('click', () => centerEditor('details'));
  elements.resetDetails.addEventListener('click', resetDetailsTransform);
  bindSecondaryDetailsPositionControls();
  elements.freeTextScale.addEventListener(
    'input',
    () => resizeEditorByPercentage('free-text', Number(elements.freeTextScale.value)),
  );
  elements.centerFreeText.addEventListener('click', () => centerEditor('free-text'));
  elements.resetFreeText.addEventListener('click', resetFreeTextTransform);
  elements.zoom.addEventListener('input', () => setPreviewZoom(elements.zoom.value));
  elements.zoomOut.addEventListener('click', () => setPreviewZoom(state.previewZoom - Number(elements.zoom.step)));
  elements.zoomIn.addEventListener('click', () => setPreviewZoom(state.previewZoom + Number(elements.zoom.step)));
  elements.thirdsGridToggle.addEventListener('click', () => {
    setThirdsGridVisible(!state.thirdsGridVisible);
  });
  elements.download.addEventListener('click', downloadStory);
}

export async function initStoriesEditor() {
  bindEvents();
  setPreviewZoom(state.previewZoom);
  setThirdsGridVisible(state.thirdsGridVisible);
  drawPreviewNow();
  try {
    await Promise.all([loadBackgrounds(), loadProducts()]);
    await preselectProductFromLocation();
    await renderPreview();
  } catch {
    // The individual loading functions already show a useful error in the interface.
  }
}
