const KEY = 'vidamix:revista:selection:';
const validId = value => Number.isSafeInteger(value) && value > 0;

export function saveCampaignSelection(campaignId, productIds, storage = sessionStorage) {
  const ids = [...new Set(productIds)];
  if (!validId(campaignId) || !ids.length || ids.length > 2000 || !ids.every(validId)) {
    throw new Error('Selecione os produtos da revista para continuar.');
  }
  const token = crypto.randomUUID();
  try { storage.setItem(KEY + token, JSON.stringify({ campaignId, productIds: ids })); }
  catch { throw new Error('Não foi possível guardar a seleção. Permita o armazenamento neste navegador e tente novamente.'); }
  return token;
}

export async function loadCampaignSelection(search, request, storage = sessionStorage) {
  const token = new URLSearchParams(search).get('selection');
  if (!token) return null;
  let saved;
  try { saved = JSON.parse(storage.getItem(KEY + token)); } catch { /* Show recovery below. */ }
  if (!saved || !validId(saved.campaignId) || !Array.isArray(saved.productIds)
      || !saved.productIds.length || saved.productIds.length > 2000 || !saved.productIds.every(validId)
      || new Set(saved.productIds).size !== saved.productIds.length) {
    throw new Error('Esta seleção não está disponível. Volte à revista e selecione os produtos novamente.');
  }
  // Only IDs travel between pages. Always reload prices, availability and backgrounds.
  const { campaign } = await request('/api/revista/active');
  if (!campaign || campaign.id !== saved.campaignId) {
    throw new Error('A revista vigente mudou. Volte à revista para escolher as ofertas atuais.');
  }
  const itemsById = new Map(campaign.items.map(item => [item.productId, item]));
  const items = saved.productIds.map(id => {
    const item = itemsById.get(id);
    if (!item?.available || !item.imageUrl || !Number.isSafeInteger(item.priceCents) || item.priceCents <= 0) {
      throw new Error('Um produto selecionado não está mais disponível. Volte à revista e revise a seleção.');
    }
    return {
      product: { id, nome: item.name, subtitulo: item.description || '', fabricante: item.manufacturer || '', ean: item.ean, imagem_local_url: item.imageUrl },
      price: (item.priceCents / 100).toFixed(2).replace('.', ','), priceCents: item.priceCents,
    };
  });
  return { campaign, items };
}
