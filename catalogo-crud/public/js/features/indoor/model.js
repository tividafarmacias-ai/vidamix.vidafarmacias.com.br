export const PRODUCT_LIMIT = 5;
export const INDOOR_DURATION_TIERS = [10, 15, 20];
export const DEFAULT_INDOOR_DURATION = INDOOR_DURATION_TIERS[0];

export function addProduct(selection, product) {
  if (!product?.id || !product.imagem_local_url || selection.length >= PRODUCT_LIMIT
      || selection.some((item) => item.product.id === product.id)) return selection;
  return [...selection, { product, originalPrice: '', price: '', duration: DEFAULT_INDOOR_DURATION }];
}

export function setProductDuration(selection, id, duration) {
  const index = selection.findIndex((item) => item.product.id === id);
  if (index < 0 || !INDOOR_DURATION_TIERS.includes(duration) || selection[index].duration === duration) {
    return selection;
  }
  const result = [...selection];
  result[index] = { ...result[index], duration };
  return result;
}

export function removeProduct(selection, id) {
  return selection.filter((item) => item.product.id !== id);
}

export function moveProduct(selection, id, direction) {
  const index = selection.findIndex((item) => item.product.id === id);
  const target = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || target < 0 || target >= selection.length) return selection;
  const result = [...selection];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export function canContinue(selection) {
  return selection.length === PRODUCT_LIMIT
    && new Set(selection.map((item) => item.product.id)).size === PRODUCT_LIMIT
    && selection.every((item) => Boolean(item.product.imagem_local_url));
}
