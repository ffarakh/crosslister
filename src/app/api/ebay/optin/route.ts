import { ebayApiFor } from "@/lib/ebay/connection";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

/** Opts the seller into eBay business policies, required before the Inventory API can publish. */
export async function POST() {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const conn = await ebayApiFor(sb, user.id);
    if (!conn) throw new HttpError(400, "Connect eBay first");
    await conn.api.optInToBusinessPolicies();
    return Response.json({ ok: true, note: "Opt-in requested. eBay can take a while to process it; then create postage, payment and returns policies in eBay." });
  } catch (e) {
    return errorResponse(e);
  }
}
