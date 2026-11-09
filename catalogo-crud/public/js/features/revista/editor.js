import { authFetch } from '../../auth-session.js';

const byId = id => document.getElementById(`revista-${id}`);
const money = cents => Number.isSafeInteger(cents) ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
let report = null;
let validatedFile = null;
let busy = false;
let detailCampaign = null;
let savingBackgrounds = false;
let backgroundsLoading = false;
let backgroundsReady = false;
const backgroundFormats = [
  { key: 'stories', label: 'Story', url: '/api/story-backgrounds' },
  { key: 'feed', label: 'Feed', url: '/api/feed-backgrounds' },
  { key: 'indoor-h', label: 'TV Indoor', url: '/api/indoor-backgrounds' },
];
const backgroundOptions = {};
const backgroundPickers = {};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function status(message, error = false, target = 'status') {
  byId(target).textContent = message;
  byId(target).classList.toggle('is-error', error);
}
function setBusy(value) {
  busy = value;
  for (const id of ['file', 'name', 'validate']) byId(id).disabled = value;
  byId('create').disabled = value || !report?.valid || !validatedFile;
  byId('import-form').setAttribute('aria-busy', String(value));
  syncBackgroundControls();
}
async function request(url, options = {}) {
  const response = await authFetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok && !data.report) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data;
}
function selectedBackgrounds(scope) {
  return Object.fromEntries(backgroundFormats.map(({ key }) => [key, backgroundPickers[scope][key].select.value]).filter(([, value]) => value));
}
function syncBackgroundControls() {
  for (const scope of ['import', 'detail']) {
    for (const { select } of Object.values(backgroundPickers[scope])) {
      select.disabled = !backgroundsReady || backgroundsLoading || (scope === 'import' ? busy : savingBackgrounds);
    }
  }
  byId('save-backgrounds').disabled = !detailCampaign || !backgroundsReady || backgroundsLoading || savingBackgrounds;
  byId('reload-backgrounds').disabled = backgroundsLoading || savingBackgrounds || busy;
}
function renderBackgroundPickers(scope, selection = {}) {
  for (const { key } of backgroundFormats) {
    const { select, preview } = backgroundPickers[scope][key];
    const options = backgroundOptions[key] || [];
    const empty = node('option', 'Sem vínculo'); empty.value = '';
    select.replaceChildren(empty, ...options.map(background => {
      const option = node('option', background.nome); option.value = background.arquivo; return option;
    }));
    if (selection[key] && !options.some(background => background.arquivo === selection[key])) {
      const missing = node('option', `${selection[key]} (indisponível)`); missing.value = selection[key]; select.append(missing);
    }
    select.value = selection[key] || '';
    const background = options.find(option => option.arquivo === select.value);
    preview.hidden = !background;
    if (background) preview.src = background.thumbnail_url || background.url;
  }
}
for (const scope of ['import', 'detail']) {
  backgroundPickers[scope] = {};
  for (const { key, label } of backgroundFormats) {
    const wrapper = node('div', undefined, 'revista-background-picker');
    const select = node('select'); select.id = `revista-${scope}-background-${key}`;
    const caption = node('label', label); caption.htmlFor = select.id;
    const preview = node('img', undefined, 'revista-background-preview'); preview.alt = `Background para ${label}`;
    preview.loading = 'lazy'; preview.hidden = true;
    backgroundPickers[scope][key] = { select, preview };
    select.addEventListener('change', () => renderBackgroundPickers(scope, selectedBackgrounds(scope)));
    wrapper.append(caption, select, preview);
    byId(`${scope}-backgrounds`).append(wrapper);
  }
  renderBackgroundPickers(scope);
}
async function loadBackgroundOptions() {
  if (backgroundsLoading || savingBackgrounds || busy) return;
  backgroundsLoading = true;
  syncBackgroundControls();
  status('Carregando backgrounds…', false, 'background-status');
  try {
    const results = await Promise.all(backgroundFormats.map(async format => ({ key: format.key, ...(await request(format.url)) })));
    for (const { key, items } of results) backgroundOptions[key] = items;
    backgroundsReady = true;
    for (const scope of ['import', 'detail']) renderBackgroundPickers(scope, selectedBackgrounds(scope));
    status('Fundos disponíveis para vincular à revista.', false, 'background-status');
  } catch (error) { status(`${error.message} Clique em Atualizar fundos para tentar novamente.`, true, 'background-status'); }
  finally { backgroundsLoading = false; syncBackgroundControls(); }
}
byId('reload-backgrounds').addEventListener('click', loadBackgroundOptions);
byId('background-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!detailCampaign || savingBackgrounds || !backgroundsReady || backgroundsLoading) return;
  const campaignId = detailCampaign.id;
  savingBackgrounds = true;
  syncBackgroundControls();
  status('Salvando backgrounds…', false, 'detail-status');
  try {
    const campaign = await request(`/api/revista/campaigns/${campaignId}/backgrounds`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backgrounds: selectedBackgrounds('detail') }),
    });
    if (detailCampaign?.id === campaignId) {
      detailCampaign = campaign;
      renderBackgroundPickers('detail', campaign.backgrounds);
      status('Backgrounds salvos. Os novos anúncios desta revista usarão os fundos selecionados.', false, 'detail-status');
    }
  } catch (error) { if (detailCampaign?.id === campaignId) status(error.message, true, 'detail-status'); }
  finally { savingBackgrounds = false; syncBackgroundControls(); }
});
function productRows(target, items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = node('tr');
    row.append(node('td', item.ean), node('td', item.name), node('td', money(item.priceCents)));
    fragment.append(row);
  }
  target.replaceChildren(fragment);
}
function showReport(result) {
  report = result;
  byId('report').hidden = false;
  byId('review-empty').hidden = true;
  const skippedCount = result.total - result.items.length;
  byId('summary').textContent = `${result.total} linhas · ${result.items.length} válidas para importar · ${skippedCount} ignoradas${result.month ? ` · Vigência ${result.month}` : ''}`;
  byId('errors-panel').hidden = !result.errors.length;
  byId('errors').replaceChildren(...result.errors.map(error => node('li', `${error.line ? `Linha ${error.line}: ` : ''}${error.message}`)));
  byId('missing-panel').hidden = !result.missing.length;
  byId('missing').replaceChildren(...result.missing.map(item => {
    const row = node('tr'); row.append(node('td', item.line), node('td', item.ean)); return row;
  }));
  productRows(byId('matched'), result.items);
  byId('matched-panel').open = result.valid;
  byId('create').textContent = skippedCount ? `Criar com ${result.items.length} ${result.items.length === 1 ? 'produto válido' : 'produtos válidos'}` : 'Criar campanha';
  byId('create-hint').textContent = result.valid
    ? skippedCount ? `${skippedCount} ${skippedCount === 1 ? 'linha será ignorada' : 'linhas serão ignoradas'} por erro ou ausência no catálogo. A campanha incluirá somente os itens válidos listados na conferência.` : 'Tudo conferido. Crie a campanha para salvar estes produtos e preços.'
    : 'Nenhum produto válido para importar. Corrija as informações ou cadastre os produtos e importe novamente.';
}
function resetReport() {
  report = null; validatedFile = null;
  byId('report').hidden = true; byId('review-empty').hidden = false;
  byId('create').disabled = true;
}
byId('file').addEventListener('change', () => { resetReport(); status('Planilha selecionada. Clique em Importar e conferir produtos.'); });
byId('import-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const file = byId('file').files[0];
  resetReport();
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > 2_000_000) return status('Selecione um arquivo XLSX de até 2 MB.', true);
  setBusy(true); status('Lendo a planilha e conferindo os EANs no catálogo…');
  try {
    const body = new FormData(); body.append('file', file);
    showReport(await request('/api/revista/validate', { method: 'POST', body }));
    validatedFile = file;
    status(report.valid ? `Conferência concluída. ${report.items.length} produtos prontos para criar a campanha.` : 'Conferência concluída. Veja as pendências ao lado.', !report.valid);
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
byId('create').addEventListener('click', async () => {
  if (busy || !report?.valid || !validatedFile) return;
  setBusy(true); status('Salvando a campanha…');
  try {
    const body = new FormData(); body.append('file', validatedFile); body.append('name', byId('name').value.trim());
    body.append('backgrounds', JSON.stringify(selectedBackgrounds('import')));
    const data = await request('/api/revista/campaigns', { method: 'POST', body });
    if (data.report) { showReport(data.report); status('O catálogo mudou. Confira as pendências antes de criar.', true); return; }
    resetReport();
    const skippedMessage = data.skippedCount ? ` ${data.skippedCount} ${data.skippedCount === 1 ? 'linha foi ignorada' : 'linhas foram ignoradas'} por erro ou ausência no catálogo.` : '';
    status((data.existing ? 'Esta campanha já havia sido importada. Abrimos a campanha existente.' : `Campanha “${data.campaign.name}” criada com ${data.campaign.items.length} produtos.`) + skippedMessage);
    showCampaign(data.campaign);
    await loadCampaigns();
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
function showCampaign(campaign) {
  detailCampaign = campaign;
  byId('campaign-detail').hidden = false;
  byId('detail-title').textContent = campaign.name;
  byId('detail-month').textContent = `Vigência ${campaign.month} · ${campaign.items.length} produtos`;
  productRows(byId('detail-items'), campaign.items);
  renderBackgroundPickers('detail', campaign.backgrounds);
  status('', false, 'detail-status');
  syncBackgroundControls();
  byId('detail-title').focus();
}
async function loadCampaigns() {
  byId('refresh').disabled = true;
  status('Carregando campanhas…', false, 'list-status');
  try {
    const { items } = await request('/api/revista/campaigns');
    byId('campaigns').replaceChildren(...items.map(campaign => {
      const card = node('article', undefined, 'revista-campaign');
      const actions = node('div', undefined, 'revista-campaign-actions');
      const open = node('button', 'Produtos e fundos', 'revista-button secondary'); open.type = 'button';
      open.addEventListener('click', async () => {
        open.disabled = true;
        try { showCampaign(await request(`/api/revista/campaigns/${campaign.id}`)); }
        catch (error) { status(error.message, true, 'list-status'); }
        finally { open.disabled = false; }
      });
      const remove = node('button', 'Remover', 'revista-button danger'); remove.type = 'button';
      remove.setAttribute('aria-label', `Remover campanha ${campaign.name}`);
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Remover a campanha “${campaign.name}” e todos os seus produtos?`)) return;
        remove.disabled = open.disabled = true;
        try {
          await request(`/api/revista/campaigns/${campaign.id}`, { method: 'DELETE' });
          if (detailCampaign?.id === campaign.id) {
            detailCampaign = null;
            byId('campaign-detail').hidden = true;
            syncBackgroundControls();
          }
          await loadCampaigns();
          status(`Campanha “${campaign.name}” removida.`, false, 'list-status');
        } catch (error) {
          status(error.message, true, 'list-status');
          remove.disabled = open.disabled = false;
        }
      });
      actions.append(open, remove);
      card.append(node('h3', campaign.name), node('p', `${campaign.month} · ${campaign.productCount} produtos`), actions);
      return card;
    }));
    status(items.length ? `${items.length} campanhas salvas.` : 'Nenhuma campanha criada ainda. Comece importando sua planilha.', false, 'list-status');
  } catch (error) { status(error.message, true, 'list-status'); }
  finally { byId('refresh').disabled = false; }
}
byId('refresh').addEventListener('click', loadCampaigns);
void loadBackgroundOptions();
void loadCampaigns();
