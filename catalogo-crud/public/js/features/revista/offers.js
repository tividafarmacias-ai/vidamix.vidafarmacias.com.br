import { campaignArtworkUrl } from './artwork.js';
import { saveCampaignSelection } from './selection.js';
import { PRODUCT_LIMIT } from '../indoor/model.js';
import { authFetch } from '../../auth-session.js';
const byId = id => document.getElementById('offers-' + id);
const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const selected = new Set();
const actions = [...document.querySelectorAll('[data-batch-format]')];
let campaign = null;
let visibleCount = 24;
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function thumbnail(url) {
  const image = node('img');
  image.src = `${url}${url.includes('?') ? '&' : '?'}variant=thumb`;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => { image.hidden = true; });
  return image;
}
function productCard(item) {
  const card = node('article', 'home-revista-product');
  const picture = node('div', 'home-revista-picture');
  if (item.imageUrl) picture.append(thumbnail(item.imageUrl));
  else picture.append(node('span', '', 'Sem imagem'));
  const body = node('div', 'home-revista-product-body');
  body.append(node('span', 'home-revista-brand', item.manufacturer || 'Na revista deste mês'),
    node('h3', '', item.name), node('p', 'home-revista-product-description', item.description || ''),
    node('p', 'home-revista-ean', `EAN ${item.ean}`));
  const price = node('div', 'home-revista-price');
  price.append(node('span', '', 'Preço da revista'), node('strong', '', money(item.priceCents)));
  body.append(price);
  if (item.available) {
    const actions = node('div', 'home-revista-product-actions');
    actions.setAttribute('aria-label', `Criar arte de ${item.name}`);
    for (const [format, label] of [['stories', 'Story'], ['feed', 'Feed'], ['indoor-h', 'TV Indoor']]) {
      const link = node('a', '', label);
      link.href = campaignArtworkUrl(format, campaign.id, item.productId);
      link.setAttribute('aria-label', `Criar ${label} de ${item.name} por ${money(item.priceCents)}`);
      actions.append(link);
    }
    body.append(node('span', 'home-revista-create-label', 'Criar arte'), actions);
  } else {
    body.append(node('p', 'home-revista-unavailable', 'Produto ou imagem indisponível no catálogo.'));
  }
  const label = node('label', 'offer-select');
  const check = node('input');
  check.type = 'checkbox';
  check.checked = selected.has(item.productId);
  check.disabled = !item.available;
  check.setAttribute('aria-label', 'Selecionar ' + item.name);
  check.dataset.productId = String(item.productId);
  const caption = node('span', '', item.available ? 'Selecionar produto' : 'Indisponível');
  card.classList.toggle('is-selected', check.checked);
  card.classList.toggle('is-unavailable', !item.available);
  check.addEventListener('change', () => {
    if (check.checked) selected.add(item.productId);
    else selected.delete(item.productId);
    card.classList.toggle('is-selected', check.checked);
    syncSelection();
  });
  label.append(check, caption);
  card.append(label, picture, body);
  return card;
}

function filteredItems() {
  const query = normalize(byId('search').value.trim());
  return (campaign?.items || []).filter(item => normalize([item.name, item.description, item.manufacturer, item.ean].join(' ')).includes(query));
}
function syncSelection() {
  byId('count').textContent = selected.size ? selected.size + (selected.size === 1 ? ' produto selecionado' : ' produtos selecionados') : 'Nenhum produto selecionado';
  actions.forEach(button => {
    const indoor = button.dataset.batchFormat === 'indoor-h';
    const overLimit = indoor && selected.size > PRODUCT_LIMIT;
    button.disabled = !selected.size || overLimit;
    if (indoor) {
      button.textContent = overLimit ? `TV Indoor (máx. ${PRODUCT_LIMIT} produtos)` : 'Criar vídeo Indoor';
      button.title = overLimit ? `Selecione até ${PRODUCT_LIMIT} produtos para criar um vídeo Indoor.` : '';
    }
  });
  byId('clear').disabled = !selected.size;
  byId('select-all').disabled = !filteredItems().some(item => item.available && !selected.has(item.productId));
  try { sessionStorage.setItem('vidamix:revista:checked:' + campaign.id, JSON.stringify([...selected])); } catch { /* Selection still works in memory. */ }
}
function renderProducts() {
  const items = filteredItems();
  byId('products').replaceChildren(...items.slice(0, visibleCount).map(productCard));
  byId('status').textContent = items.length ? Math.min(visibleCount, items.length) + ' de ' + items.length + ' produtos. A seleção é mantida ao buscar ou ver mais.' : 'Nenhum produto encontrado. Tente outro nome ou EAN.';
  byId('more').hidden = visibleCount >= items.length;
  syncSelection();
}
async function loadCampaign() {
  byId('retry').hidden = true;
  byId('status').textContent = 'Carregando revista vigente…';
  try {
    const response = await authFetch('/api/revista/active', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    ({ campaign } = await response.json());
    if (!campaign) { byId('status').textContent = 'Nenhuma revista vigente neste mês. As ofertas aparecerão aqui quando uma campanha estiver disponível.'; return; }
    byId('title').textContent = campaign.name;
    byId('description').textContent = 'Vigência ' + campaign.month + ' · Selecione produtos para vídeo Indoor ou artes de Feed e Stories em lote.';
    const available = new Set(campaign.items.filter(item => item.available).map(item => item.productId));
    try {
      const saved = JSON.parse(sessionStorage.getItem('vidamix:revista:checked:' + campaign.id) || '[]');
      if (Array.isArray(saved)) saved.filter(id => available.has(id)).forEach(id => selected.add(id));
    } catch { /* A blocked storage does not prevent browsing. */ }
    byId('toolbar').hidden = byId('selection').hidden = false;
    renderProducts();
  } catch {
    byId('status').textContent = 'Não foi possível carregar a revista. Tente novamente.';
    byId('retry').hidden = false;
  }
}
byId('search').addEventListener('input', () => { visibleCount = 24; renderProducts(); });
byId('more').addEventListener('click', () => {
  const previous = visibleCount;
  visibleCount += 24;
  renderProducts();
  byId('products').children[previous]?.querySelector('input')?.focus();
});
byId('select-all').addEventListener('click', () => {
  filteredItems().filter(item => item.available).forEach(item => selected.add(item.productId));
  renderProducts();
});
byId('clear').addEventListener('click', () => { selected.clear(); renderProducts(); });
byId('retry').addEventListener('click', () => void loadCampaign());
actions.forEach(button => button.addEventListener('click', () => {
  if (!selected.size || (button.dataset.batchFormat === 'indoor-h' && selected.size > PRODUCT_LIMIT)) return;
  try {
    const ids = campaign.items.filter(item => selected.has(item.productId)).map(item => item.productId);
    const token = saveCampaignSelection(campaign.id, ids);
    window.location.assign('/artes/' + button.dataset.batchFormat + '?selection=' + encodeURIComponent(token));
  } catch (error) {
    byId('action-status').textContent = error.message;
    byId('action-status').classList.add('is-error');
  }
}));
void loadCampaign();
