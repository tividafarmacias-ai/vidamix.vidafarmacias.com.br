import { authFetch } from './js/auth-session.js';

const FORMATS = Object.freeze({
  stories: {
    label: 'Stories',
    endpoint: '/api/story-backgrounds',
    upload: '/api/backgrounds/stories',
    help: 'Escolha uma imagem para usar como cenário das artes verticais.',
  },
  feed: {
    label: 'Feed',
    endpoint: '/api/feed-backgrounds',
    upload: '/api/backgrounds/feed',
    help: 'Escolha uma imagem para usar como cenário das artes de Feed.',
  },
  'indoor-h': {
    label: 'TV Indoor',
    endpoint: '/api/indoor-backgrounds',
    upload: '/api/backgrounds/indoor-h',
    help: 'Cadastre o cenário e o wallpaper que serão usados nas campanhas horizontais.',
  },
});

const elements = {
  tabs: [...document.querySelectorAll('[data-format]')],
  form: document.querySelector('#background-form'),
  formatBadge: document.querySelector('#background-format-badge'),
  uploadHelp: document.querySelector('#upload-help'),
  fileLabel: document.querySelector('#background-file-label'),
  file: document.querySelector('#background-file'),
  fileName: document.querySelector('#background-file-name'),
  wallpaperField: document.querySelector('#wallpaper-field'),
  wallpaperFile: document.querySelector('#wallpaper-file'),
  wallpaperFileName: document.querySelector('#wallpaper-file-name'),
  indoorNote: document.querySelector('#indoor-note'),
  submit: document.querySelector('#background-submit'),
  formStatus: document.querySelector('#background-form-status'),
  libraryTitle: document.querySelector('#library-title'),
  count: document.querySelector('#background-count'),
  listStatus: document.querySelector('#background-list-status'),
  list: document.querySelector('#background-list'),
  toast: document.querySelector('#background-toast'),
};

let currentFormat = 'stories';
let toastTimer;

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('is-error', error);
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.classList.toggle('is-error', error);
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3500);
}

async function requestJson(url, options) {
  const response = await authFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

function setSelectedFileName(input, output) {
  output.textContent = input.files?.[0]?.name || 'Nenhum arquivo escolhido';
}

function updateFormat(format) {
  currentFormat = format;
  const config = FORMATS[format];
  elements.tabs.forEach((tab) => {
    const selected = tab.dataset.format === format;
    tab.setAttribute('aria-selected', String(selected));
  });
  elements.formatBadge.textContent = config.label;
  elements.uploadHelp.textContent = config.help;
  elements.libraryTitle.textContent = `Biblioteca de ${config.label}`;
  const indoor = format === 'indoor-h';
  elements.fileLabel.textContent = indoor ? 'Imagem do background' : 'Imagem do background';
  elements.wallpaperField.hidden = !indoor;
  elements.indoorNote.hidden = !indoor;
  elements.wallpaperFile.required = indoor;
  elements.form.reset();
  elements.fileName.textContent = 'Nenhum arquivo escolhido';
  elements.wallpaperFileName.textContent = 'Nenhum arquivo escolhido';
  setStatus(elements.formStatus, '');
  void loadBackgrounds();
}

function makeImage(url, alt) {
  const image = document.createElement('img');
  image.src = url;
  image.alt = alt;
  image.loading = 'lazy';
  image.addEventListener('error', () => image.replaceWith(document.createTextNode('Prévia indisponível')));
  return image;
}

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'background-card';

  const previews = document.createElement('div');
  previews.className = `background-previews${item.wallpaper_url ? ' has-wallpaper' : ''}`;
  const primary = document.createElement('figure');
  primary.className = 'background-preview';
  primary.append(makeImage(item.thumbnail_url || item.url, `${item.nome} — background`));
  const primaryCaption = document.createElement('figcaption');
  primaryCaption.textContent = 'Background';
  primary.append(primaryCaption);
  previews.append(primary);

  if (item.wallpaper_url) {
    const wallpaper = document.createElement('figure');
    wallpaper.className = 'background-preview';
    wallpaper.append(makeImage(item.wallpaper_thumbnail_url || item.wallpaper_url, `${item.nome} — wallpaper`));
    const wallpaperCaption = document.createElement('figcaption');
    wallpaperCaption.textContent = 'Wallpaper';
    wallpaper.append(wallpaperCaption);
    previews.append(wallpaper);
  }

  const content = document.createElement('div');
  content.className = 'background-card-content';
  const title = document.createElement('h3');
  title.textContent = item.nome || 'Background sem nome';
  const meta = document.createElement('p');
  meta.textContent = item.wallpaper_url ? 'Duas imagens cadastradas' : 'Uma imagem cadastrada';
  const remove = document.createElement('button');
  remove.className = 'background-remove-button';
  remove.type = 'button';
  remove.textContent = 'Remover';
  remove.addEventListener('click', () => removeBackground(item));
  content.append(title, meta, remove);
  card.append(previews, content);
  return card;
}

async function loadBackgrounds() {
  const formatAtRequest = currentFormat;
  elements.list.replaceChildren();
  elements.list.setAttribute('aria-busy', 'true');
  setStatus(elements.listStatus, 'Carregando backgrounds…');
  try {
    const response = await requestJson(FORMATS[formatAtRequest].endpoint);
    if (formatAtRequest !== currentFormat) return;
    const items = Array.isArray(response.items) ? response.items : [];
    elements.count.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    elements.list.replaceChildren(...items.map(renderCard));
    setStatus(elements.listStatus, items.length ? '' : 'Ainda não há backgrounds cadastrados neste formato.');
  } catch (error) {
    setStatus(elements.listStatus, error.message, true);
  } finally {
    elements.list.setAttribute('aria-busy', 'false');
  }
}

async function removeBackground(item) {
  if (!window.confirm(`Remover “${item.nome || 'este background'}”? Esta ação apaga o arquivo${item.wallpaper_url ? ' e o wallpaper' : ''}.`)) return;
  try {
    await requestJson(`/api/backgrounds/${currentFormat}/${encodeURIComponent(item.id || item.arquivo)}`, { method: 'DELETE' });
    showToast('Background removido.');
    await loadBackgrounds();
  } catch (error) {
    showToast(error.message, true);
  }
}

elements.tabs.forEach((tab) => tab.addEventListener('click', () => updateFormat(tab.dataset.format)));
elements.file.addEventListener('change', () => setSelectedFileName(elements.file, elements.fileName));
elements.wallpaperFile.addEventListener('change', () => setSelectedFileName(elements.wallpaperFile, elements.wallpaperFileName));
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!elements.file.files?.length || (currentFormat === 'indoor-h' && !elements.wallpaperFile.files?.length)) {
    setStatus(elements.formStatus, currentFormat === 'indoor-h'
      ? 'Selecione o background e o wallpaper da campanha.'
      : 'Selecione uma imagem para continuar.', true);
    return;
  }

  elements.submit.disabled = true;
  setStatus(elements.formStatus, 'Enviando imagens…');
  try {
    await requestJson(FORMATS[currentFormat].upload, { method: 'POST', body: new FormData(elements.form) });
    elements.form.reset();
    elements.fileName.textContent = 'Nenhum arquivo escolhido';
    elements.wallpaperFileName.textContent = 'Nenhum arquivo escolhido';
    setStatus(elements.formStatus, 'Background adicionado com sucesso.');
    showToast('Background adicionado.');
    await loadBackgrounds();
  } catch (error) {
    setStatus(elements.formStatus, error.message, true);
  } finally {
    elements.submit.disabled = false;
  }
});

updateFormat(currentFormat);
