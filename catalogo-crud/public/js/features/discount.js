// Prices entered by the editors use Brazilian decimal and grouping separators.
export function getDiscountLabel(originalPrice, price) {
  const parse = value => {
    const text = String(value ?? '').replace(/^R\$\s*/, '').trim();
    if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(text)) return NaN;
    return Math.round(Number(text.replace(/\./g, '').replace(',', '.')) * 100);
  };
  const original = parse(originalPrice);
  const current = parse(price);
  if (!(original > 0 && current >= 0 && current < original)) return '';
  const percent = Math.round((original - current) / original * 10000) / 100;
  return `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% OFF`;
}
