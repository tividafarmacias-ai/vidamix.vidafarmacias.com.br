import { getBackgroundBadgeTheme } from '../stories/background-theme.js';
import { rememberCreatedArtwork } from '../created-artworks.js';
import { authFetch } from '../../auth-session.js';
import { loadArtworkSelection } from '../revista/artwork.js';
import { loadCampaignSelection } from '../revista/selection.js';
import { PRODUCT_LIMIT, INDOOR_DURATION_TIERS, addProduct, removeProduct, moveProduct, setProductDuration, canContinue } from './model.js';
import { INDOOR_WIDTH, INDOOR_HEIGHT, INDOOR_INTRO_DURATION, getProductDurations, getIndoorDuration, getIndoorMotionRanges, drawIndoorFrame } from './renderer.js';
import { bindPriceInput } from '../stories/price-input.js';
import { createArtworkDraftStore, findDraftBackground } from '../artwork-draft.js';

const byId = (id) => document.getElementById(`indoor-${id}`);
const ui = Object.fromEntries([
  'search', 'results', 'results-summary', 'load-more', 'selected', 'selection-count',
  'backgrounds', 'reload-backgrounds', 'canvas', 'preview-loading',
  'play', 'time', 'time-label', 'scenes', 'download', 'export-status', 'export-progress',
  'cancel-export', 'download-link', 'retry-preview', 'duration', 'sequence',
  'products-toggle', 'products-content', 'products-panel', 'products-summary',
  'background-toggle', 'background-content', 'background-panel', 'background-summary',
].map((id) => [id, byId(id)]));
const context = ui.canvas.getContext('2d');
const state = {
  selection: [], products: [], page: 0, total: 0, hasMore: false,
  productRequest: null, productError: false, backgrounds: [], background: null,
  backgroundsLoading: false, backgroundsLoaded: false, snapshot: null, previewVersion: 0,
  campaignBackgroundFile: '', campaignBackgroundError: '',
  campaignBatch: false, selectionLimit: PRODUCT_LIMIT,
  seconds: 0, playing: false, frame: 0, exportController: null, downloadUrl: null,
};
const images = new Map();
const draftStore = createArtworkDraftStore('indoor-h', { search: window.location?.search });
const restoredDraft = draftStore.load();
if (restoredDraft) Object.assign(state, restoredDraft);
let draftReady = Boolean(restoredDraft) || !['productId', 'campaignId', 'selection']
  .some(key => new URLSearchParams(window.location?.search).has(key));
let searchTimer;
let previewTimer;

function saveEditorDraft() {
  if (draftReady) draftStore.save(state);
}

function selectionComplete() {
  return canContinue(state.selection, { flexible: state.campaignBatch, limit: state.selectionLimit });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function thumbnail(url, alt = '') {
  const image = element('img');
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = url;
  return image;
}

function button(label, onClick, className = '') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function status(message, error = false, node = ui['export-status']) {
  node.textContent = message;
  node.classList.toggle('is-error', error);
}

function togglePanel(name) {
  const content = ui[name + '-content'];
  content.hidden = !content.hidden;
  ui[name + '-toggle'].setAttribute('aria-expanded', String(!content.hidden));
  ui[name + '-panel'].classList.toggle('is-collapsed', content.hidden);
}

function selectionStatus() {
  if (state.campaignBackgroundError) {
    status(state.campaignBackgroundError, true);
    return;
  }
  const count = state.selection.length;
  if (!count) status('');
  else if (!state.background) status('Escolha um fundo para visualizar os produtos no anúncio.');
  else if (!selectionComplete()) status(count + ' de ' + state.selectionLimit + ' produtos selecionados. Complete a seleção para baixar o MP4.');
  else status('Seu anúncio está pronto. Confira a prévia e baixe o MP4.');
}

function syncControls() {
  const busy = Boolean(state.exportController);
  const complete = selectionComplete();
  const hasWallpaper = Boolean(state.background?.wallpaper_url);
  const durations = getProductDurations(state.selection);
  const duration = getIndoorDuration(hasWallpaper, state.selection);
  ui.time.max = String(Math.max(0, duration - 1 / 30));
  ui.duration.textContent = duration + ' segundos';
  const sequenceSummary = !durations.length ? 'Adicione os produtos do anúncio'
    : new Set(durations).size === 1 ? durations[0] + ' s por produto' : durations.join(' + ') + ' s';
  ui.sequence.textContent = !durations.length ? sequenceSummary
    : (hasWallpaper ? 'Abertura de 3 s + ' : '') + state.selection.length + ' produtos · ' + sequenceSummary;
  ui.download.textContent = busy ? 'Exportando…' : duration ? 'Baixar MP4 · ' + duration + ' s' : 'Baixar MP4';
  ui['products-summary'].textContent = state.selection.length + ' de ' + state.selectionLimit + ' selecionados';
  ui['background-summary'].textContent = state.background?.nome || 'Escolha o visual da campanha';
  ui['products-panel'].classList.toggle('is-complete', complete);
  ui['background-panel'].classList.toggle('is-complete', Boolean(state.background));
  ui['reload-backgrounds'].disabled = busy || state.backgroundsLoading;
  ui.search.disabled = busy;
  ui['load-more'].disabled = busy || Boolean(state.productRequest);
  ui.play.disabled = ui.time.disabled = busy || !state.snapshot;
  ui.download.disabled = busy || state.backgroundsLoading || !state.snapshot || !complete;
  ui['retry-preview'].disabled = busy;
  for (const node of ui.scenes.querySelectorAll('button')) node.disabled = busy || !state.snapshot;
  for (const node of ui.backgrounds.querySelectorAll('button')) node.disabled = busy;
  for (const node of ui.results.querySelectorAll('button')) {
    const selected = node.getAttribute('aria-pressed') === 'true';
    const product = state.products.find(item => String(item.id) === node.dataset.productId);
    node.disabled = busy || !product?.imagem_local_url || (!selected && state.selection.length >= state.selectionLimit);
  }
  for (const [index, row] of [...ui.selected.children].entries()) {
    for (const node of row.querySelectorAll('button')) {
      node.disabled = busy || (node.dataset.move === '-1' && index === 0)
        || (node.dataset.move === '1' && index === state.selection.length - 1);
    }
    for (const node of row.querySelectorAll('input')) node.disabled = busy;
  }
}

function clearDownload() {
  if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = null;
  ui['download-link'].hidden = true;
  ui['download-link'].removeAttribute('href');
}

function invalidatePreview() {
  saveEditorDraft();
  pause();
  clearTimeout(previewTimer);
  state.snapshot = null;
  state.previewVersion += 1;
  clearDownload();
  ui.scenes.replaceChildren();
  ui['retry-preview'].hidden = true;
  ui['preview-loading'].hidden = false;
  const ready = Boolean(state.background && state.selection.length);
  ui['preview-loading'].textContent = ready ? 'Atualizando a prévia…'
    : state.background ? 'Adicione produtos para visualizar seu anúncio.'
      : 'Escolha um fundo e adicione produtos para visualizar seu anúncio.';
  if (!ready) {
    state.seconds = 0;
    ui.time.value = '0';
    ui['time-label'].textContent = '0,0 / 0 s';
  }
  status(ready ? 'Atualizando a prévia…' : 'Selecione os produtos e um fundo para baixar o vídeo.', false, ui['export-status']);
  syncControls();
  if (ready) previewTimer = setTimeout(() => void preparePreview(), 200);
}

function updateSelection(next) {
  if (state.exportController || next === state.selection) return;
  state.selection = next;
  invalidatePreview();
  renderSelected();
  renderResults();
  selectionStatus();
}

function renderSelected() {
  ui['selection-count'].textContent = `${state.selection.length} / ${state.selectionLimit}`;
  ui.selected.replaceChildren();
  for (let index = 0; index < (state.campaignBatch ? state.selection.length : PRODUCT_LIMIT); index += 1) {
    const entry = state.selection[index];
    const row = element('li', entry ? '' : 'indoor-slot-empty');
    row.append(element('span', 'indoor-slot', String(index + 1)));
    if (!entry) {
      row.append(element('p', '', 'Adicione um produto do catálogo'));
    } else {
      const { product } = entry;
      const details = element('div');
      const actions = element('div', 'indoor-item-actions');
      const reorder = (direction) => {
        updateSelection(moveProduct(state.selection, product.id, direction));
        const row = ui.selected.querySelector(`[data-product-id="${product.id}"]`);
        const action = row?.querySelector(`[data-move="${direction}"]:not(:disabled)`)
          || row?.querySelector('.indoor-item-actions button:not(:disabled)');
        action?.focus({ preventScroll: true });
      };
      const up = button('↑', () => reorder(-1));
      const down = button('↓', () => reorder(1));
      const remove = button('Remover', () => {
        updateSelection(removeProduct(state.selection, product.id));
        const nextRow = ui.selected.children[Math.min(index, state.selection.length - 1)];
        const nextAction = nextRow?.querySelector('.indoor-item-actions button:not(:disabled)');
        (nextAction || byId('selected-heading')).focus({ preventScroll: true });
      });

      up.dataset.move = '-1';
      down.dataset.move = '1';
      up.setAttribute('aria-label', `Antecipar ${product.nome}`);
      down.setAttribute('aria-label', `Adiar ${product.nome}`);
      remove.setAttribute('aria-label', `Remover ${product.nome}`);
      up.disabled = index === 0;
      down.disabled = index === state.selection.length - 1;
      actions.append(up, down, remove);
      const durations = element('div', 'indoor-durations');
      durations.setAttribute('role', 'group');
      durations.setAttribute('aria-label', `Tempo na TV de ${product.nome}`);
      durations.append(element('span', 'indoor-durations-label', 'Tempo na TV'));
      for (const tier of INDOOR_DURATION_TIERS) {
        const option = button(`${tier} s`, () => {
          const next = setProductDuration(state.selection, product.id, tier);
          if (next === state.selection) return;
          updateSelection(next);
          const row = ui.selected.querySelector(`[data-product-id="${product.id}"]`);
          const chosen = row?.querySelector(`[data-tier="${tier}"]`);
          chosen?.focus({ preventScroll: true });
          // Confirmation pulse on the chosen tier, plus a status line that keeps
          // the new total visible until the next action.
          if (chosen) {
            chosen.classList.toggle('is-confirmed', true);
            setTimeout(() => chosen.classList.toggle('is-confirmed', false), 700);
          }
          const total = getIndoorDuration(Boolean(state.background?.wallpaper_url), state.selection);
          status(`${product.nome}: ${tier} segundos na TV · vídeo com ${total} s.`);
        }, 'indoor-duration-tier');
        option.dataset.tier = String(tier);
        option.setAttribute('aria-pressed', String(entry.duration === tier));
        option.setAttribute('aria-label', `${tier} segundos na TV para ${product.nome}`);
        durations.append(option);
      }
      const prices = element('div', 'indoor-prices');
      for (const [field, label] of [['originalPrice', 'De · normal (R$)'], ['price', 'Por · promoção (R$)']]) {
        const priceLabel = element('label', 'indoor-price', label);
        const input = element('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.placeholder = '0,00';
        input.maxLength = 16;
        input.value = entry[field] || '';
        input.dataset.priceField = field;
        input.setAttribute('aria-label', label + ' de ' + product.nome);
        bindPriceInput(input, (price) => {
          if (state.exportController || price === entry[field]) return;
          entry[field] = price;
          invalidatePreview();
        });
        priceLabel.append(input);
        prices.append(priceLabel);
      }
      details.append(element('strong', '', product.nome), actions, durations, prices);
      row.dataset.productId = String(product.id);
      row.append(thumbnail(product.imagem_local_url), details);
    }
    ui.selected.append(row);
  }
  syncControls();
}

function renderResults() {
  ui.results.replaceChildren();
  for (const product of state.products) {
    const selected = state.selection.some((entry) => entry.product.id === product.id);
    const card = button('', () => {
      updateSelection(selected ? removeProduct(state.selection, product.id) : addProduct(state.selection, product, state.selectionLimit));
      ui.results.querySelector(`[data-product-id="${product.id}"]`)?.focus({ preventScroll: true });
    }, 'indoor-product');
    card.dataset.productId = String(product.id);
    card.disabled = !product.imagem_local_url || (!selected && state.selection.length >= state.selectionLimit);
    card.setAttribute('aria-pressed', String(selected));
    if (product.imagem_local_url) card.append(thumbnail(product.imagem_local_url));
    card.append(element('strong', '', product.nome), element('small', '', selected ? '✓ Selecionado' : 'Adicionar ao vídeo'));
    ui.results.append(card);
  }
  if (!state.products.length) ui.results.append(element('p', 'indoor-empty', state.productRequest
    ? 'Buscando produtos…' : state.productError ? 'Não foi possível carregar o catálogo. Tente novamente.'
      : 'Nenhum produto com imagem encontrado. Tente outra busca.'));
  ui['results-summary'].textContent = `${state.products.length} de ${state.total} produtos com imagem`;
  ui['load-more'].hidden = !state.hasMore && !state.productError;
  ui['load-more'].textContent = state.productError ? 'Tentar carregar produtos novamente' : 'Carregar mais produtos';
  ui.results.setAttribute('aria-busy', String(Boolean(state.productRequest)));
  syncControls();
}

async function fetchJson(url, signal) {
  const response = await authFetch(url, { signal });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sua sessão expirou. Atualize a página para entrar novamente.'
    : 'Não foi possível carregar os dados. Tente novamente.');
  return response.json();
}

async function loadProducts(append = false) {
  state.productRequest?.abort();
  const controller = new AbortController();
  state.productRequest = controller;
  state.productError = false;
  if (!append) {
    state.products = [];
    state.page = 0;
    state.total = 0;
    state.hasMore = false;
  }
  renderResults();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const params = new URLSearchParams({ q: ui.search.value.trim(), imagem: 'com', status: 'ativo', pageSize: '18', page: String(state.page + 1) });
    const response = await fetchJson(`/api/products?${params}`, controller.signal);
    if (state.productRequest !== controller) return;
    state.products = append ? [...state.products, ...response.items] : response.items;
    state.page = response.pagination.page;
    state.total = response.pagination.total;
    state.hasMore = state.page < response.pagination.totalPages;
    selectionStatus();
  } catch (error) {
    if (state.productRequest !== controller) return;
    state.productError = true;
    status(error.name === 'AbortError' ? 'A busca demorou demais. Tente carregar os produtos novamente.' : error.message, true);
  } finally {
    clearTimeout(timeout);
    if (state.productRequest === controller) {
      state.productRequest = null;
      renderResults();
    }
  }
}

function renderBackgrounds() {
  ui.backgrounds.replaceChildren();
  for (const background of state.backgrounds) {
    const card = button('', () => {
      if (state.exportController) return;
      state.background = background;
      state.seconds = 0;
      state.campaignBackgroundFile = '';
      state.campaignBackgroundError = '';
      invalidatePreview();
      for (const option of ui.backgrounds.querySelectorAll('.indoor-background-option')) {
        option.setAttribute('aria-pressed', String(option === card));
      }
      ui.backgrounds.querySelector('[aria-pressed="true"]')?.focus();
      selectionStatus();
    }, 'indoor-background-option');
    card.setAttribute('aria-pressed', String(state.background?.url === background.url));
    card.append(thumbnail(background.thumbnail_url || background.url), element('span', '', background.nome),
      element('small', '', background.wallpaper_url ? 'Com abertura da campanha' : 'Sem abertura'));
    ui.backgrounds.append(card);
  }
  if (!state.backgrounds.length) ui.backgrounds.append(element('p', 'indoor-empty', state.backgroundsLoading
    ? 'Carregando fundos…' : 'Ainda não há fundos para TV Indoor. Assim que forem disponibilizados, clique em Atualizar fundos.'));
  ui.backgrounds.setAttribute('aria-busy', String(state.backgroundsLoading));
  ui['reload-backgrounds'].hidden = state.backgroundsLoading;
  syncControls();
}

async function loadBackgrounds() {
  if (state.backgroundsLoading) return;
  state.backgroundsLoading = true;
  renderBackgrounds();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchJson('/api/indoor-backgrounds', controller.signal);
    state.backgrounds = response.items.map((item) => ({ ...item, url: item.preview_url || item.url }));
    state.backgroundsLoaded = true;
    if (state.background) {
      const previous = state.background;
      state.background = findDraftBackground(state.backgrounds, previous);
      state.campaignBackgroundError = state.background ? '' : 'O fundo salvo não está mais disponível. Escolha outro fundo para continuar.';
      if (!state.snapshot || !state.background || state.background.url !== previous.url
        || state.background.wallpaper_url !== previous.wallpaper_url
        || state.background.wallpaper_preview_url !== previous.wallpaper_preview_url) invalidatePreview();
    }
    if (state.campaignBackgroundFile && !state.background) {
      state.background = state.backgrounds.find(item => item.arquivo === state.campaignBackgroundFile) || null;
      state.campaignBackgroundError = state.background ? '' : 'O background vinculado à revista não está mais disponível. Escolha outro fundo para continuar.';
      if (state.background) state.campaignBackgroundFile = '';
      invalidatePreview();
    }
    selectionStatus();
  } catch (error) {
    status(error.name === 'AbortError'
      ? 'O carregamento dos fundos demorou demais. Tente atualizar a lista.' : error.message, true);
  } finally {
    clearTimeout(timeout);
    state.backgroundsLoading = false;
    renderBackgrounds();
  }
}

function loadImage(url) {
  if (images.has(url)) return images.get(url);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    const timeout = setTimeout(() => finish(new Error('O carregamento de uma imagem demorou demais. Tente novamente.')), 20000);
    function finish(error) {
      clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    }
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? null : new Error('Uma imagem está vazia ou inválida.'));
    image.onerror = () => finish(new Error('Não foi possível carregar uma das imagens. Confira o fundo e os produtos e tente novamente.'));
    image.src = url;
  });
  images.set(url, promise);
  promise.catch(() => images.delete(url));
  return promise;
}

function paint() {
  if (!state.snapshot) return;
  const carousel = drawIndoorFrame(context, state.snapshot, state.seconds);
  ui.time.value = String(state.seconds);
  ui['time-label'].textContent = `${state.seconds.toFixed(1).replace('.', ',')} / ${getIndoorDuration(Boolean(state.snapshot.wallpaper), state.snapshot.products)} s`;
  [...ui.scenes.children].forEach((node) => node.setAttribute('aria-pressed', String(Number(node.dataset.productIndex) === carousel.index)));
}

function pause() {
  state.playing = false;
  cancelAnimationFrame(state.frame);
  ui.play.textContent = 'Reproduzir';
}

function play() {
  if (!state.snapshot || state.exportController) return;
  state.playing = true;
  ui.play.textContent = 'Pausar';
  const origin = performance.now() - state.seconds * 1000;
  function tick(now) {
    if (!state.playing) return;
    state.seconds = ((now - origin) / 1000) % getIndoorDuration(Boolean(state.snapshot.wallpaper), state.snapshot.products);
    paint();
    state.frame = requestAnimationFrame(tick);
  }
  state.frame = requestAnimationFrame(tick);
}

async function preparePreview() {
  if (state.exportController || !state.background || !state.selection.length) return;
  clearTimeout(previewTimer);
  const version = ++state.previewVersion;
  ui['preview-loading'].hidden = false;
  ui['preview-loading'].textContent = 'Preparando as imagens…';
  ui['retry-preview'].hidden = true;
  ui.scenes.replaceChildren();
  const selected = state.selection.map((entry) => ({ product: { ...entry.product }, originalPrice: entry.originalPrice ? `R$ ${entry.originalPrice}` : '', price: entry.price ? `R$ ${entry.price}` : '', duration: entry.duration }));
  const backgroundUrl = state.background.url;
  const wallpaperUrl = state.background.wallpaper_preview_url || state.background.wallpaper_url;
  const wallpaperThumbnail = state.background.wallpaper_thumbnail_url || wallpaperUrl;
  const needed = new Set([backgroundUrl, wallpaperUrl, ...selected.map((entry) => entry.product.imagem_local_url)]);
  for (const url of images.keys()) if (!needed.has(url)) images.delete(url);
  try {
    if (!context) throw new Error('Este navegador não conseguiu abrir a prévia. Tente novamente no Chrome ou Edge.');
    const [background, wallpaper, ...loaded] = await Promise.all([
      loadImage(backgroundUrl),
      wallpaperUrl ? loadImage(wallpaperUrl) : null,
      ...selected.map((entry) => loadImage(entry.product.imagem_local_url)),
    ]);
    if (state.previewVersion !== version) return;
    state.snapshot = { background, wallpaper, badgeTheme: getBackgroundBadgeTheme(background, { width: 128, height: 72 }), products: selected.map((entry, index) => ({ ...entry, image: loaded[index] })) };
    state.seconds = Math.min(state.seconds, getIndoorDuration(Boolean(wallpaper), selected) - 1 / 30);
    const intro = wallpaper ? INDOOR_INTRO_DURATION : 0;
    if (wallpaper) {
      const opening = button('', () => {
        pause();
        state.seconds = 0;
        paint();
      });
      opening.dataset.productIndex = '-1';
      opening.setAttribute('aria-label', 'Ver abertura da campanha');
      opening.append(thumbnail(wallpaperThumbnail), element('span', '', `Abertura · 0–${intro} s`));
      ui.scenes.append(opening);
    }
    const productDurations = getProductDurations(selected);
    selected.forEach((entry, index) => {
      const start = intro + productDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
      const node = button('', () => {
        pause();
        state.seconds = start;
        paint();
      });
      node.dataset.productIndex = String(index);
      node.setAttribute('aria-label', `Ver produto ${index + 1}: ${entry.product.nome}`);
      node.append(thumbnail(entry.product.imagem_local_url), element('span', '', `${index + 1} · ${start}–${start + productDurations[index]} s`));
      ui.scenes.append(node);
    });
    paint();
    ui['preview-loading'].hidden = true;
    status(selectionComplete() ? 'Prévia pronta. Seu anúncio está disponível para baixar.'
      : 'Prévia da seleção atual. Complete os ' + state.selectionLimit + ' produtos para baixar.', false, ui['export-status']);
  } catch (error) {
    if (state.previewVersion !== version) return;
    state.snapshot = null;
    ui['preview-loading'].textContent = error.message;
    ui['retry-preview'].hidden = false;
    status(error.message, true, ui['export-status']);
  } finally {
    syncControls();
  }
}

async function download() {
  if (!state.snapshot || !selectionComplete() || state.backgroundsLoading || state.exportController) return;
  pause();
  clearDownload();
  const snapshot = state.snapshot;
  const controller = new AbortController();
  state.exportController = controller;
  const canvas = document.createElement('canvas');
  canvas.width = INDOOR_WIDTH;
  canvas.height = INDOOR_HEIGHT;
  ui['export-progress'].hidden = false;
  ui['export-progress'].value = 0;
  ui['cancel-export'].hidden = false;
  ui['cancel-export'].disabled = false;
  syncControls();
  status('Preparando a exportação MP4…', false, ui['export-status']);
  try {
    const { exportStoryVideo } = await import('../stories/video-export.js');
    const exportContext = canvas.getContext('2d');
    if (!exportContext) throw new Error('Não foi possível preparar o vídeo neste navegador.');
    const blob = await exportStoryVideo({
      canvas, signal: controller.signal, duration: getIndoorDuration(Boolean(snapshot.wallpaper), snapshot.products),
      motionRanges: getIndoorMotionRanges({ hasWallpaper: Boolean(snapshot.wallpaper), products: snapshot.products }),
      renderFrame: (seconds) => drawIndoorFrame(exportContext, snapshot, seconds),
      onProgress: (fraction) => {
        const percentage = Math.round(fraction * 100);
        ui['export-progress'].value = percentage;
        status(`Exportando vídeo: ${percentage}%`, false, ui['export-status']);
      },
    });
    if (controller.signal.aborted) return;
    state.downloadUrl = URL.createObjectURL(blob);
    ui['download-link'].href = state.downloadUrl;
    ui['download-link'].download = `vidamix-indoor-h-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
    ui['download-link'].hidden = false;
    ui['download-link'].click();
    ui['cancel-export'].hidden = true;
    status('Vídeo pronto. Salvando em Artes criadas…', false, ui['export-status']);
    const saved = await rememberCreatedArtwork({ blob, filename: ui['download-link'].download, title: 'TV Indoor', format: 'indoor-h' });
    status('Vídeo pronto! Se o download não começar, use Baixar vídeo novamente. ' + saved, false, ui['export-status']);
  } catch (error) {
    status(error.name === 'AbortError' ? 'Exportação cancelada. Você pode tentar novamente.' : error.message,
      error.name !== 'AbortError', ui['export-status']);
  } finally {
    canvas.width = canvas.height = 0;
    state.exportController = null;
    ui['export-progress'].hidden = true;
    ui['cancel-export'].hidden = true;
    syncControls();
  }
}

for (const name of ['products', 'background']) {
  ui[name + '-toggle'].addEventListener('click', () => togglePanel(name));
}

ui['reload-backgrounds'].addEventListener('click', () => void loadBackgrounds());
ui['retry-preview'].addEventListener('click', () => void preparePreview());
ui.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  state.productRequest?.abort();
  state.productRequest = null;
  state.products = [];
  state.page = state.total = 0;
  state.hasMore = state.productError = false;
  renderResults();
  ui.results.replaceChildren(element('p', 'indoor-empty', 'Buscando produtos…'));
  ui.results.setAttribute('aria-busy', 'true');
  searchTimer = setTimeout(() => void loadProducts(), 200);
});
ui['load-more'].addEventListener('click', () => void loadProducts(state.page > 0));
ui.play.addEventListener('click', () => state.playing ? pause() : play());
ui.time.addEventListener('input', () => {
  pause();
  state.seconds = Math.min(getIndoorDuration(Boolean(state.snapshot?.wallpaper), state.snapshot?.products ?? []) - 1 / 30, Math.max(0, Number(ui.time.value) || 0));
  paint();
});
ui.download.addEventListener('click', () => void download());
ui['cancel-export'].addEventListener('click', () => {
  state.exportController?.abort();
  ui['cancel-export'].disabled = true;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveEditorDraft(); pause(); }
});
window.addEventListener('pagehide', () => {
  saveEditorDraft();
  pause();
  clearTimeout(searchTimer);
  clearTimeout(previewTimer);
  state.previewVersion += 1;
  state.productRequest?.abort();
  state.productRequest = null;
  state.exportController?.abort();
  clearDownload();
});
renderSelected();
async function initializeProducts() {
  await loadProducts();
  if (restoredDraft || !window.location?.search) return;
  try {
    if (new URLSearchParams(window.location.search).has('selection')) {
      const batch = await loadCampaignSelection(window.location.search, url => fetchJson(url, AbortSignal.timeout(15000)));
      state.campaignBatch = true;
      state.selectionLimit = Math.max(PRODUCT_LIMIT, batch.items.length);
      const next = batch.items.map(item => ({ product: item.product, price: item.price, originalPrice: '', duration: INDOOR_DURATION_TIERS[0] }));
      state.campaignBackgroundFile = batch.campaign.backgrounds?.['indoor-h'] || '';
      draftReady = true;
      updateSelection(next);

      ui.canvas.setAttribute('aria-label', 'Prévia do vídeo dos produtos selecionados para TV');
      const back = element('a', 'indoor-button secondary', '← Voltar à seleção da revista');
      back.href = '/revista/ofertas';
      ui['export-status'].after(back);
      if (state.campaignBackgroundFile) await loadBackgrounds();
      return;
    }
    const selection = await loadArtworkSelection(window.location.search, async url => {
      const response = await authFetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a oferta.');
      return data;
    });
    if (!selection) return;
    const next = addProduct(state.selection, selection.product);
    if (next === state.selection) return;
    next[next.length - 1].price = selection.price || '';
    state.campaignBackgroundFile = selection.backgrounds?.['indoor-h'] || '';
    draftReady = true;
    updateSelection(next);
    if (state.campaignBackgroundFile) await loadBackgrounds();
  } catch (error) { status(error.message, true); }
  finally { draftReady = true; }
}
void initializeProducts();
void loadBackgrounds();
