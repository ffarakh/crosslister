/** GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) check-digit validation. */
export function isValidGtin(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length)) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  // Weights alternate 3,1 starting from the digit nearest the check digit.
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** Attribute names that hold a barcode. */
export const isGtinKey = (k: string) => /ean|upc|gtin|barcode|isbn/i.test(k);

/** First barcode in the attributes (digits only), or "". */
export function findGtin(attrs: Record<string, string>): string {
  for (const [k, v] of Object.entries(attrs)) if (isGtinKey(k) && v.replace(/\D/g, "").length >= 8) return v.replace(/\D/g, "");
  return "";
}
