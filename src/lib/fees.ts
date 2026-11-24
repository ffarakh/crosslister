/**
 * eBay UK Buyer Protection fee, charged to the BUYER on items from UK private sellers
 * (business sellers include it at no cost to the buyer). Source: ebay.co.uk help "Buyer Protection fee".
 * £0.10 flat + 7% of the item price up to £20 + 4% of £20–£300 + 2% of £300–£4,000. Postage is excluded.
 */
export function buyerProtectionPence(itemPence: number): number {
  if (!itemPence || itemPence <= 0) return 0;
  const band = (lo: number, hi: number, rate: number) => Math.max(0, Math.min(itemPence, hi) - lo) * rate;
  return Math.round(10 + band(0, 2000, 0.07) + band(2000, 30000, 0.04) + band(30000, 400000, 0.02));
}

export interface BuyerTotal {
  itemPence: number;
  protectionPence: number;
  postagePence: number;
  totalPence: number;
}

/** What the buyer pays all-in on eBay for a private-seller listing. */
export function ebayBuyerTotal(itemPence: number, postagePence: number): BuyerTotal {
  const protectionPence = buyerProtectionPence(itemPence);
  return { itemPence, protectionPence, postagePence, totalPence: itemPence + protectionPence + postagePence };
}

/** Highest item price (pence) whose all-in buyer total is ≤ the target total. */
export function itemPriceForBuyerTotal(targetTotalPence: number, postagePence: number): number {
  if (targetTotalPence <= postagePence) return 0;
  let lo = 0;
  let hi = targetTotalPence;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ebayBuyerTotal(mid, postagePence).totalPence <= targetTotalPence) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
