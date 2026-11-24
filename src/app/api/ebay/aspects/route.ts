import { rateLimit } from "@/lib/ratelimit";
import { EbayApi } from "@/lib/ebay/api";
import { ebayConfig } from "@/lib/ebay/config";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const sb = await supabaseServer();
    await requireUser(sb);
    await rateLimit(sb, "ebay_lookup", 40, 60);
    const id = new URL(req.url).searchParams.get("categoryId")?.trim();
    if (!id) throw new HttpError(400, "Missing categoryId");
    const api = new EbayApi(ebayConfig(), "");
    const details = await api.requiredAspectDetails(id);
    return Response.json({
      required: details.map((a) => a.name),
      values: Object.fromEntries(details.map((a) => [a.name, a.values])),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
