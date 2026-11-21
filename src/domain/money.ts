// So'm are stored as whole integers. Formatting uses a normal space as the thousands separator.

export function formatNumber(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatSom(n: number, unit = "so'm"): string {
  return `${formatNumber(n)} ${unit}`;
}

/** Payme works in tiyin. Only call this at the Payme boundary. */
export const somToTiyin = (som: number) => som * 100;
export const tiyinToSom = (tiyin: number) => tiyin / 100;
