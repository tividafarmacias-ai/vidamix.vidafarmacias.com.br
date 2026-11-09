import { authFetch } from '../../auth-session.js';

const byId = id => document.getElementById(`home-${id}`);
let campaign = null;

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
  byId('revista-status').textContent = '';
  byId('revista-status').hidden = true;
}
async function loadCampaign() {
  byId('revista-retry').hidden = true;
  byId('revista-status').textContent = 'Carregando revista vigente…';
  try {
    const response = await authFetch('/api/revista/active', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    ({ campaign } = await response.json());
    if (!campaign) {
      byId('revista-status').textContent = 'Nenhuma revista vigente neste mês. As ofertas aparecerão aqui quando uma campanha estiver disponível.';
      return;
    }
    showCampaign();
  } catch {
    byId('revista-status').textContent = 'Não foi possível carregar a revista. Tente novamente.';
    byId('revista-retry').hidden = false;
  }
}
byId('revista-retry').addEventListener('click', () => void loadCampaign());
void loadCampaign();
