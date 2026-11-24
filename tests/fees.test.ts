import { describe, expect, it } from "vitest";
import { buyerProtectionPence, ebayBuyerTotal, itemPriceForBuyerTotal } from "@/lib/fees";

describe("eBay UK buyer protection fee", () => {
  it("matches eBay's banded formula", () => {
    expect(buyerProtectionPence(1000)).toBe(80); // £0.10 + 7% of £10
    expect(buyerProtectionPence(2000)).toBe(150); // £0.10 + £1.40
    expect(buyerProtectionPence(7999)).toBe(390); // £0.10 + £1.40 + 4% of £59.99
    expect(buyerProtectionPence(50000)).toBe(1670); // £0.10 + £1.40 + £11.20 + 2% of £200
    expect(buyerProtectionPence(1_000_000)).toBe(8670); // capped at £86.70
  });

  it("totals item + protection + postage", () => {
    expect(ebayBuyerTotal(7999, 349)).toEqual({ itemPence: 7999, protectionPence: 390, postagePence: 349, totalPence: 8738 });
  });

  it("works backwards from the total the buyer should pay", () => {
    const item = itemPriceForBuyerTotal(7999, 349);
    expect(ebayBuyerTotal(item, 349).totalPence).toBeLessThanOrEqual(7999);
    expect(ebayBuyerTotal(item + 1, 349).totalPence).toBeGreaterThan(7999);
    expect(item).toBe(7288); // £72.88 item + £3.62 protection + £3.49 postage = £79.99 all-in
  });
});
