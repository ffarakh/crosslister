/** Normalise a UK postcode to eBay's expected "OUTWARD INWARD" form (e.g. "dy90xa" → "DY9 0XA"). Returns null if invalid. */
export function normaliseUkPostcode(raw: string): string | null {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(s)) return null;
  return `${s.slice(0, -3)} ${s.slice(-3)}`;
}
