export const priceFor = (base, discountPct = 0) =>
  Number(((base * (100 - discountPct)) / 100).toFixed(2));
