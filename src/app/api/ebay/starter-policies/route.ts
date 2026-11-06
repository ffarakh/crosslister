import { EbayApiError } from "@/lib/ebay/api";
import { ebayApiFor } from "@/lib/ebay/connection";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

/** One-click: create basic postage/payment/returns policies and save them as the user's defaults. */
export async function POST() {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const conn = await ebayApiFor(sb, user.id);
    if (!conn) throw new HttpError(400, "Connect eBay first");
    let ids;
    try {
      ids = await conn.api.createStarterPolicies();
    } catch (e) {
      if (e instanceof EbayApiError)
        throw new HttpError(400, `eBay couldn't create the policies: ${e.message}. If you just opted in, wait a minute and try again.`);
      throw e;
    }
    await sb.from("ebay_connections").update({ defaults: { ...conn.defaults, ...ids } }).eq("user_id", user.id);
    return Response.json({ ok: true, ids });
  } catch (e) {
    return errorResponse(e);
  }
}
