import { z } from "zod";
import { EbayApiError } from "@/lib/ebay/api";
import { ebayApiFor } from "@/lib/ebay/connection";
import { normaliseUkPostcode } from "@/lib/postcode";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

const Body = z.object({ postalCode: z.string().min(2).max(10), name: z.string().min(1).max(100).optional() });

/**
 * Creates (or corrects) the eBay inventory location that offers need, makes it the default,
 * and points the seller's existing draft items at it.
 */
export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const body = Body.parse(await req.json());
    const postcode = normaliseUkPostcode(body.postalCode);
    if (!postcode) throw new HttpError(400, "Enter a full UK postcode, e.g. DY8 1AA");
    const conn = await ebayApiFor(sb, user.id);
    if (!conn) throw new HttpError(400, "Connect eBay first");

    const key = `home-${postcode.replace(/\s+/g, "").toLowerCase()}`;
    const name = body.name || `Home ${postcode}`;
    try {
      await conn.api.createLocation(key, postcode, name);
    } catch (e) {
      // Already exists (409, or 400 on some marketplaces) → update its address so a bad earlier entry is fixed.
      if (!(e instanceof EbayApiError)) throw e;
      try {
        await conn.api.updateLocation(key, postcode, name);
      } catch {
        throw e;
      }
    }

    await sb.from("ebay_connections").update({ defaults: { ...conn.defaults, merchantLocationKey: key } }).eq("user_id", user.id);

    // Point existing unpublished drafts at the corrected location (RLS limits this to the caller's rows).
    const { data: rows } = await sb.from("listings").select("id, data");
    for (const r of rows ?? []) {
      const d = r.data as { platforms?: { ebay?: { fields?: { merchantLocationKey?: string } } } };
      const f = d.platforms?.ebay?.fields;
      if (f && f.merchantLocationKey !== key) {
        f.merchantLocationKey = key;
        await sb.from("listings").update({ data: d, updated_at: new Date().toISOString() }).eq("id", r.id);
      }
    }
    return Response.json({ key, postcode });
  } catch (e) {
    return errorResponse(e);
  }
}
