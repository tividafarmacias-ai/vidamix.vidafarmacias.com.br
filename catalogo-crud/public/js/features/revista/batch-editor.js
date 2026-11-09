import { loadCampaignSelection } from './selection.js';
import { exportArtworkBatch } from './zip.js';

export async function initCampaignBatchEditor({ format, request, prepare, render, setBusy, isBusy }) {
  if (!new URLSearchParams(window.location.search).has('selection')) return false;
  const panel = document.createElement('section');
  panel.className = 'revista-batch-panel';
  panel.setAttribute('aria-label', 'Exportação em lote da revista');
  panel.innerHTML = '<div><strong>Artes da revista em lote</strong><p class="revista-batch-help">Uma arte por produto, com preço da revista e ajuste automático. Confira o fundo no editor antes de gerar o ZIP.</p></div><div class="revista-batch-actions"><a href="/revista/ofertas">← Voltar à seleção</a><button type="button" data-batch-start disabled>Baixar lote em ZIP</button><button type="button" data-batch-cancel hidden>Cancelar</button><a data-batch-download hidden>Baixar ZIP novamente</a></div><p data-batch-status role="status" aria-live="polite">Carregando seleção…</p><progress data-batch-progress max="100" value="0" hidden aria-label="Progresso do lote"></progress>';
  document.querySelector('main').before(panel);
  document.body.classList.add('has-revista-batch');
  const start = panel.querySelector('[data-batch-start]');
  const cancel = panel.querySelector('[data-batch-cancel]');
  const progress = panel.querySelector('progress');
  const status = panel.querySelector('[data-batch-status]');
  const link = panel.querySelector('[data-batch-download]');
  let controller, downloadUrl, batch;
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('is-error', error); };
  const clearDownload = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null; link.hidden = true; link.removeAttribute('href');
  };
  cancel.addEventListener('click', () => { controller?.abort(); cancel.disabled = true; say('Cancelando lote…'); });
  window.addEventListener('pagehide', () => { controller?.abort(); clearDownload(); });
  window.addEventListener('beforeunload', event => { if (controller) { event.preventDefault(); event.returnValue = ''; } });
  try {
    batch = await loadCampaignSelection(window.location.search, request);
    await prepare(batch);
    say(`${batch.items.length} artes de ${format === 'feed' ? 'Feed' : 'Stories'} · ${batch.campaign.name}. Confira o fundo e clique em Baixar lote em ZIP.`);
    start.disabled = false;
  } catch (error) { say(error.message, true); }
  start.addEventListener('click', async () => {
    if (controller || !batch) return;
    if (isBusy()) { say('Aguarde a exportação atual terminar para gerar o lote.', true); return; }
    controller = new AbortController();
    const { signal } = controller;
    clearDownload();
    start.disabled = true; cancel.hidden = false; cancel.disabled = false;
    progress.hidden = false; progress.value = 0;
    const surfaces = [...document.querySelectorAll('main, .stories-topbar, .site-header')];
    const previousInert = surfaces.map(element => element.inert);
    surfaces.forEach(element => { element.inert = true; });
    setBusy(true);
    cancel.focus();
    try {
      say('Conferindo os preços e a disponibilidade da revista…');
      batch = await loadCampaignSelection(window.location.search, url => request(url, { signal }));
      signal.throwIfAborted();
      const blob = await exportArtworkBatch({
        items: batch.items, format, signal, render,
        onProgress: (done, total) => { progress.value = done / total * 100; say(`Gerando artes: ${done} de ${total}…`); },
      });
      signal.throwIfAborted();
      downloadUrl = URL.createObjectURL(blob);
      link.href = downloadUrl;
      link.download = `revista-${batch.campaign.id}-${format}.zip`;
      link.hidden = false;
      link.click();
      say(`${batch.items.length} artes prontas! O ZIP contém um PNG por produto. Se necessário, use Baixar ZIP novamente.`);
    } catch (error) {
      say(error.name === 'AbortError' ? 'Lote cancelado. A seleção foi mantida para tentar novamente.' : error.message, error.name !== 'AbortError');
    } finally {
      controller = null; setBusy(false);
      surfaces.forEach((element, index) => { element.inert = previousInert[index]; });
      start.disabled = false; cancel.hidden = true; progress.hidden = true;
      start.focus();
    }
  });
  return true;
}
