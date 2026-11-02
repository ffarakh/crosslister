import { EbayApiError } from "@/lib/ebay/api";
import { ebayApiFor } from "@/lib/ebay/connection";
import { EbayConfigError, ebayConfig } from "@/lib/ebay/config";
import { errorResponse, requireUser, supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    let env: string;
    try {
      env = ebayConfig().env;
    } catch (e) {
      if (e instanceof EbayConfigError) return Response.json({ configured: false, message: e.message });
      throw e;
    }
    const conn = await ebayApiFor(sb, user.id);
    if (!conn) return Response.json({ configured: true, env, connected: false });

    let policies: Awaited<ReturnType<typeof conn.api.listPolicies>> | null = null;
    let locations: { key: string; name: string }[] = [];
    let policyError: string | null = null;
    try {
      policies = await conn.api.listPolicies();
    } catch (e) {
      policyError = e instanceof EbayApiError ? e.message : (e as Error).message;
    }
    try {
      locations = (await conn.api.listLocations()).map((l) => ({ key: l.merchantLocationKey, name: l.name ?? l.merchantLocationKey }));
    } catch {
      locations = [];
    }
    return Response.json({ configured: true, env, connected: true, defaults: conn.defaults, policies, policyError, locations });
  } catch (e) {
    return errorResponse(e);
  }
}
