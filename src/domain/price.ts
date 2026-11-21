// Price engine: first pack price + price for each extra pack. The server always recalculates.

export interface PriceRuleInput {
  firstPrice: number;
  extraPrice: number;
}

export interface PriceBreakdown {
  quantity: number;
  firstPrice: number;
  extraPrice: number;
  extraCount: number;
  extraTotal: number;
  total: number;
}

export class PriceError extends Error {
  constructor(public code: "quantity_invalid" | "rule_missing") {
    super(code);
  }
}

export const DEFAULT_MAX_QUANTITY = 20;

export function calcPrice(rule: PriceRuleInput | null | undefined, quantity: number, maxQuantity = DEFAULT_MAX_QUANTITY): PriceBreakdown {
  if (!rule) throw new PriceError("rule_missing");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
    throw new PriceError("quantity_invalid");
  }
  const extraCount = quantity - 1;
  const extraTotal = extraCount * rule.extraPrice;
  return {
    quantity,
    firstPrice: rule.firstPrice,
    extraPrice: rule.extraPrice,
    extraCount,
    extraTotal,
    total: rule.firstPrice + extraTotal,
  };
}
