import { z } from "zod";
import { EbayApiError } from "@/lib/ebay/api";
import { ebayApiFor } from "@/lib/ebay/connection";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

const Body = z.object({ postalCode: z.string().min(2).max(10), name: z.string().min(1).max(100) });

/** Creates the eBay inventory location that offers need (merchantLocationKey). */
export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const { postalCode, name } = Body.parse(await req.json());
    const conn = await ebayApiFor(sb, user.id);
    if (!conn) throw new HttpError(400, "Connect eBay first");
    const key = `home-${postalCode.replace(/\s+/g, "").toLowerCase()}`;
    try {
      await conn.api.createLocation(key, postalCode.toUpperCase(), name);
    } catch (e) {
      // already exists → fine, reuse it
      if (!(e instanceof EbayApiError && e.status === 409)) throw e;
    }
    await sb.from("ebay_connections").update({ defaults: { ...conn.defaults, merchantLocationKey: key } }).eq("user_id", user.id);
    return Response.json({ key });
  } catch (e) {
    return errorResponse(e);
  }
}
