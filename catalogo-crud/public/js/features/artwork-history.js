import { authFetch } from '../auth-session.js';

const formats = { stories: 'Stories', feed: 'Feed', 'indoor-h': 'TV Indoor' };
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const grid = document.getElementById('artworks-grid');
const status = document.getElementById('artworks-status');
const retry = document.getElementById('artworks-retry');
const empty = document.getElementById('artworks-empty');

function card(item) {
  const article = document.createElement('article');
  article.className = 'artwork-card';
  const video = item.contentType === 'video/mp4';
  const preview = document.createElement(video ? 'video' : 'img');
  preview.className = 'artwork-preview';
  preview.src = `/api/artworks/${item.id}/file`;
  if (video) {
    preview.controls = true;
    preview.preload = 'metadata';
    preview.playsInline = true;
    preview.setAttribute('aria-label', `Prévia de ${item.title}`);
  } else {
    preview.alt = item.title;
    preview.loading = 'lazy';
  }
  const info = document.createElement('div');
  info.className = 'artwork-info';
  const title = document.createElement('h2');
  title.textContent = item.title;
  const details = document.createElement('p');
  details.textContent = `${formats[item.format]} · ${video ? 'MP4' : 'PNG'} · ${(item.size / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  const date = document.createElement('p');
  const time = document.createElement('time');
  time.dateTime = item.createdAt;
  time.textContent = dateFormat.format(new Date(item.createdAt));
  date.append(time);
  const download = document.createElement('a');
  download.className = 'studio-catalog-link';
  download.href = `${preview.src}?download=1`;
  download.download = item.filename;
  download.textContent = 'Baixar novamente';
  info.append(title, details, date, download);
  article.append(preview, info);
  return article;
}

async function load() {
  retry.hidden = true;
  empty.hidden = true;
  grid.replaceChildren();
  status.classList.remove('is-error');
  status.textContent = 'Carregando suas artes…';
  try {
    const response = await authFetch('/api/artworks', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Não foi possível carregar suas artes. Tente novamente.');
    const { items } = await response.json();
    grid.replaceChildren(...items.map(card));
    empty.hidden = items.length > 0;
    status.textContent = items.length ? `${items.length} de 5 artes salvas · Mais recentes primeiro` : 'Nenhuma arte salva ainda.';
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('is-error');
    retry.hidden = false;
  }
}
retry.addEventListener('click', load);
void load();
