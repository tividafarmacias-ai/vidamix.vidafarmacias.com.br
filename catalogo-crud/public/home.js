const summaryFields = {
  ativos: document.querySelector('#home-active-products'),
  comImagem: document.querySelector('#home-products-with-image'),
  backgrounds: document.querySelector('#home-story-backgrounds'),
};

const numberFormatter = new Intl.NumberFormat('pt-BR');

function renderValue(element, value) {
  if (!element) return;
  element.textContent = Number.isFinite(value) ? numberFormatter.format(value) : '—';
}

async function loadHomeOverview() {
  try {
    const [summaryResponse, backgroundsResponse] = await Promise.all([
      fetch('/api/summary', { headers: { Accept: 'application/json' } }),
      fetch('/api/story-backgrounds', { headers: { Accept: 'application/json' } }),
    ]);

    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      renderValue(summaryFields.ativos, Number(summary.ativos));
      renderValue(summaryFields.comImagem, Number(summary.com_imagem));
    }

    if (backgroundsResponse.ok) {
      const backgrounds = await backgroundsResponse.json();
      renderValue(summaryFields.backgrounds, Array.isArray(backgrounds.items) ? backgrounds.items.length : 0);
    }
  } catch {
    // A home segue funcional mesmo se os indicadores estiverem indisponíveis.
  }
}

loadHomeOverview();
