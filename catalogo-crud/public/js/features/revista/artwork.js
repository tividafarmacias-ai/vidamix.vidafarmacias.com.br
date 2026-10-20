export function campaignArtworkUrl(format, campaignId, productId) {
  const params = new URLSearchParams({ productId: String(productId), campaignId: String(campaignId) });
  return `/artes/${format}?${params}`;
}

export async function loadArtworkSelection(search, request) {
  const params = new URLSearchParams(search);
  const validId = value => /^[1-9]\d*$/.test(value || '') && Number.isSafeInteger(Number(value));
  if (!validId(params.get('productId'))) return null;
  const productId = Number(params.get('productId'));
  if (!params.has('campaignId')) {
    const product = await request(`/api/products/${productId}`);
    return product?.id === productId ? { product } : null;
  }
  if (!validId(params.get('campaignId'))) throw new Error('Campanha inválida. Escolha uma oferta na Central.');
  const selection = await request(`/api/revista/active/products/${productId}?campaignId=${params.get('campaignId')}`);
  if (selection.product?.id !== productId || !Number.isSafeInteger(selection.priceCents) || selection.priceCents <= 0) {
    throw new Error('Não foi possível carregar o preço desta oferta. Escolha uma oferta na Central.');
  }
  return { ...selection, price: (selection.priceCents / 100).toFixed(2).replace('.', ',') };
}
