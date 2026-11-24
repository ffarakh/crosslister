import { rateLimit } from "@/lib/ratelimit";
import { EbayApi } from "@/lib/ebay/api";
import { ebayConfig } from "@/lib/ebay/config";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

type Comp = { title: string; pricePence: number; url: string; condition: string };

/**
 * Current live eBay UK listings for this exact product (free Browse API, app token).
 * Tries the barcode first (exact product match), then brand + model text search.
 * Keeps only relevant results and drops accessory-priced outliers before computing stats.
 */
export async function GET(req: Request) {
  try {
    const sb = await supabaseServer();
    await requireUser(sb);
    await rateLimit(sb, "ebay_lookup", 40, 60);
    const sp = new URL(req.url).searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const gtin = (sp.get("gtin") ?? "").replace(/\D/g, "");
    const brand = sp.get("brand")?.trim().toLowerCase() ?? "";
    if (!q && !gtin) throw new HttpError(400, "Enter something to search for");

    const api = new EbayApi(ebayConfig(), "");
    let comps: Comp[] = [];
    let matchedBy: "barcode" | "search" | "search (any condition)" = "search";

    if (gtin.length >= 8) {
      comps = await api.browseSearch({ gtin, newOnly: true });
      if (comps.length) matchedBy = "barcode";
    }
    if (!comps.length && q) comps = await api.browseSearch({ q, newOnly: true });
    if (!comps.length && q) {
      comps = await api.browseSearch({ q, newOnly: false });
      matchedBy = "search (any condition)";
    }

    // Relevance: when searching by text and the brand is known, keep titles that mention it.
    if (matchedBy !== "barcode" && brand) {
      const branded = comps.filter((c) => c.title.toLowerCase().includes(brand));
      if (branded.length >= 2) comps = branded;
    }

    // Drop accessory/part listings priced far below the typical price.
    const sorted0 = comps.map((c) => c.pricePence).sort((a, b) => a - b);
    const mid0 = sorted0.length ? sorted0[Math.floor(sorted0.length / 2)] : 0;
    if (mid0 && comps.length >= 4) comps = comps.filter((c) => c.pricePence >= mid0 * 0.35);

    comps.sort((a, b) => a.pricePence - b.pricePence);
    const prices = comps.map((c) => c.pricePence);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    return Response.json({ comps: comps.slice(0, 10), min: prices[0] ?? null, median, count: comps.length, matchedBy, query: q });
  } catch (e) {
    return errorResponse(e);
  }
}
