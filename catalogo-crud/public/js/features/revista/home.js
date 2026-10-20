import { campaignArtworkUrl } from './artwork.js';
import { authFetch } from '../../auth-session.js';

const byId = id => document.getElementById(`home-${id}`);
const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pageSize = 24;
let campaign = null;
let visibleCount = pageSize;

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
  card.append(picture, body);
  return card;
}
function renderProducts() {
  const query = normalize(byId('revista-search').value.trim());
  const items = campaign.items.filter(item => normalize(`${item.name} ${item.description || ''} ${item.manufacturer || ''} ${item.ean}`).includes(query));
  byId('revista-products').replaceChildren(...items.slice(0, visibleCount).map(productCard));
  byId('revista-status').textContent = items.length
    ? `${Math.min(visibleCount, items.length)} de ${items.length} produtos${query ? ' encontrados' : ' na revista'}.`
    : 'Nenhum produto encontrado nesta revista. Tente outro nome ou EAN.';
  byId('revista-more').hidden = visibleCount >= items.length;
}
function showCampaign() {
  const [month, year] = campaign.month.split('/');
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${year}-${month}-01T12:00:00Z`));
  byId('hero').classList.add('has-campaign');
  byId('hero-chip').textContent = `CAMPANHA VIGENTE · ${campaign.month}`;
  document.getElementById('hero-title').textContent = campaign.name;
  byId('hero-description').textContent = `As ofertas de ${monthName} já estão aqui. Escolha os produtos da revista e crie suas artes com os preços da campanha.`;
  byId('campaign-action').hidden = false;
  byId('campaign-cover').hidden = false;
  byId('campaign-month').textContent = monthName;
  byId('campaign-year').textContent = year;
  byId('campaign-count').textContent = `${campaign.items.length} ${campaign.items.length === 1 ? 'oferta selecionada' : 'ofertas selecionadas'}`;
  byId('campaign-products').replaceChildren(...campaign.items.filter(item => item.imageUrl).slice(0, 3).map(item => thumbnail(item.imageUrl)));
  byId('revista-title').textContent = campaign.name;
  byId('revista-description').textContent = `Vigência ${campaign.month} · Escolha Story, Feed ou TV Indoor. O produto e o preço da revista já estarão preenchidos no editor.`;
  byId('revista-toolbar').hidden = false;
  renderProducts();
}
async function loadCampaign() {
  byId('revista-retry').hidden = true;
  byId('revista-status').textContent = 'Carregando revista vigente…';
  try {
    const response = await authFetch('/api/revista/active', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    ({ campaign } = await response.json());
    if (!campaign) {
      byId('revista-status').textContent = 'Nenhuma revista vigente neste mês. Crie uma campanha na tela Revista para destacar suas ofertas aqui.';
      return;
    }
    showCampaign();
  } catch {
    byId('revista-status').textContent = 'Não foi possível carregar a revista. Tente novamente.';
    byId('revista-retry').hidden = false;
  }
}
byId('revista-search').addEventListener('input', () => { visibleCount = pageSize; renderProducts(); });
byId('revista-more').addEventListener('click', () => {
  const previousCount = visibleCount;
  visibleCount += pageSize;
  renderProducts();
  const firstNew = byId('revista-products').children[previousCount];
  if (firstNew) { firstNew.tabIndex = -1; firstNew.focus(); }
});
byId('revista-retry').addEventListener('click', () => void loadCampaign());
void loadCampaign();
