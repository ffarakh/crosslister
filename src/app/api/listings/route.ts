import { emptyDraft } from "@/lib/listing/types";
import { errorResponse, requireUser, supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const sb = await supabaseServer();
    await requireUser(sb);
    const { data, error } = await sb
      .from("listings")
      .select("id, data, updated_at, platform_listings(platform, status, external_url)")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return Response.json({ listings: data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST() {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const draft = emptyDraft();
    const { data: conn } = await sb.from("ebay_connections").select("defaults").eq("user_id", user.id).maybeSingle();
    Object.assign(draft.platforms.ebay.fields, pickDefaults(conn?.defaults));
    const { data, error } = await sb.from("listings").insert({ data: draft }).select("id").single();
    if (error) throw new Error(error.message);
    return Response.json({ id: data.id });
  } catch (e) {
    return errorResponse(e);
  }
}

function pickDefaults(d: unknown) {
  const o = (d ?? {}) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const k of ["fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId", "merchantLocationKey"]) if (o[k]) out[k] = o[k];
  return out;
}
