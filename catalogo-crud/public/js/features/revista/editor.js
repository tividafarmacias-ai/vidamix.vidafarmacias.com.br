const byId = id => document.getElementById(`revista-${id}`);
const money = cents => Number.isSafeInteger(cents) ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
let report = null;
let validatedFile = null;
let busy = false;

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
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok && !data.report) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data;
}
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
  byId('campaign-detail').hidden = false;
  byId('detail-title').textContent = campaign.name;
  byId('detail-month').textContent = `Vigência ${campaign.month} · ${campaign.items.length} produtos`;
  productRows(byId('detail-items'), campaign.items);
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
      const open = node('button', 'Ver produtos', 'revista-button secondary'); open.type = 'button';
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
          if (!byId('campaign-detail').hidden && byId('detail-title').textContent === campaign.name) byId('campaign-detail').hidden = true;
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
void loadCampaigns();
