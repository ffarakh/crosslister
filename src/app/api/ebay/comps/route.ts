import { rateLimit } from "@/lib/ratelimit";
import { EbayApi } from "@/lib/ebay/api";
import { ebayConfig } from "@/lib/ebay/config";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

/** Current live eBay listings for a search term — free Browse API, no user token needed. */
export async function GET(req: Request) {
  try {
    const sb = await supabaseServer();
    await requireUser(sb);
    await rateLimit(sb, "ebay_lookup", 40, 60);
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) throw new HttpError(400, "Missing q");
    const api = new EbayApi(ebayConfig(), "");
    let comps = await api.browseSearch(q, true);
    if (comps.length === 0) comps = await api.browseSearch(q, false); // fall back to any condition
    const prices = comps.map((c) => c.pricePence).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    return Response.json({ comps: comps.slice(0, 10), min: prices[0] ?? null, median, count: comps.length });
  } catch (e) {
    return errorResponse(e);
  }
}
