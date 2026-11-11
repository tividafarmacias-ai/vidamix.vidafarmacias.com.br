import { PRODUCT_LIMIT, INDOOR_DURATION_TIERS, DEFAULT_INDOOR_DURATION } from './indoor/model.js';

const PREFIX = 'vidamix:artwork-draft:v1:';
const FORMATS = new Set(['stories', 'feed', 'indoor-h']);
const text = value => typeof value === 'string' ? value : '';
const record = value => value && typeof value === 'object' && !Array.isArray(value);

function product(value) {
  if (!record(value) || !Number.isSafeInteger(value.id) || value.id <= 0 || !text(value.nome)) return null;
  return Object.fromEntries(['id', 'nome', 'subtitulo', 'fabricante', 'ean', 'imagem_local_url',
    'principio_ativo', 'produto_destaque'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}

function background(value) {
  if (!record(value) || (!text(value.arquivo) && !text(value.url))) return null;
  return { arquivo: text(value.arquivo), url: text(value.url), nome: text(value.nome) };
}

function normalize(format, value) {
  if (!record(value)) return null;
  if (format === 'indoor-h') {
    if (!Array.isArray(value.selection)) return null;
    const campaignBatch = value.campaignBatch === true;
    const selectionLimit = campaignBatch && Number.isSafeInteger(value.selectionLimit)
      ? Math.min(2000, Math.max(PRODUCT_LIMIT, value.selectionLimit)) : PRODUCT_LIMIT;
    const ids = new Set();
    const selection = value.selection.flatMap(entry => {
      const item = product(entry?.product);
      if (!item || ids.has(item.id)) return [];
      ids.add(item.id);
      return [{ product: item, price: text(entry.price), originalPrice: text(entry.originalPrice),
        duration: INDOOR_DURATION_TIERS.includes(entry.duration) ? entry.duration : DEFAULT_INDOOR_DURATION }];
    }).slice(0, selectionLimit);
    return { selection, background: background(value.background), campaignBatch, selectionLimit,
      campaignBackgroundFile: text(value.campaignBackgroundFile) };
  }
  const compositionMode = ['single', 'two-products', 'combo'].includes(value.compositionMode) ? value.compositionMode : 'single';
  return {
    compositionMode, compositionChosen: value.compositionChosen === true,
    selectedProduct: product(value.selectedProduct),
    secondaryProduct: compositionMode === 'single' ? null : product(value.secondaryProduct),
    selectedBackground: background(value.selectedBackground), backgroundChosen: value.backgroundChosen === true,
    price: text(value.price), secondaryPrice: text(value.secondaryPrice),
    originalPrice: text(value.originalPrice), secondaryOriginalPrice: text(value.secondaryOriginalPrice),
    useOriginalPrice: value.useOriginalPrice === true, freeText: text(value.freeText),
  };
}

function sourceFromSearch(search) {
  const params = new URLSearchParams(search);
  return ['productId', 'campaignId', 'selection'].map(key => params.get(key) || '').join('|');
}

// Keep URLs and editable data only; decoded images, canvases and requests never enter storage.
export function createArtworkDraftStore(format, { search = '', storage } = {}) {
  if (!FORMATS.has(format)) throw new Error('Formato de arte inválido.');
  const key = PREFIX + format;
  const source = sourceFromSearch(search);
  let lastSaved;
  return {
    load() {
      try {
        const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(key));
        if (saved?.version !== 1 || (source !== '||' && saved.source !== source)) return null;
        return normalize(format, saved.data);
      } catch { return null; }
    },
    save(state) {
      try {
        const data = normalize(format, state);
        if (!data) return false;
        const serialized = JSON.stringify({ version: 1, source, data });
        if (serialized === lastSaved) return true;
        (storage ?? globalThis.localStorage).setItem(key, serialized);
        lastSaved = serialized;
        return true;
      } catch {
        // A blocked or full storage must not prevent editing or exporting.
        return false;
      }
    },
  };
}

// Asset URLs can change when a background is updated; its file name is stable.
export function findDraftBackground(backgrounds, saved) {
  if (!saved) return null;
  return backgrounds.find(item => saved.arquivo ? item.arquivo === saved.arquivo : item.url === saved.url) || null;
}
