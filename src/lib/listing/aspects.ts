/** Infer a required aspect from the category path when it's unambiguous (e.g. Department from "… › Men › …"). */
export function inferAspect(aspect: string, categoryPath: string, allowed: string[]): string {
  if (aspect.toLowerCase() !== "department") return "";
  const segs = categoryPath.split("›").map((s) => s.trim().toLowerCase());
  const has = (w: string) => segs.some((s) => s === w || s.startsWith(w + "'") || s.startsWith(w + " "));
  const pick =
    has("women") ? "Women" : has("men") ? "Men" : has("boys") ? "Boys" : has("girls") ? "Girls" : has("unisex") ? "Unisex Adults" : "";
  if (!pick) return "";
  if (!allowed.length) return pick;
  return allowed.find((v) => v.toLowerCase() === pick.toLowerCase()) ?? "";
}
