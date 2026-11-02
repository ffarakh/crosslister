import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ebayConfig } from "@/lib/ebay/config";
import { authorizeUrl } from "@/lib/ebay/oauth";
import { errorResponse, requireUser, supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const sb = await supabaseServer();
    await requireUser(sb);
    const cfg = ebayConfig();
    const state = randomBytes(24).toString("base64url");
    (await cookies()).set("ebay_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    return Response.redirect(authorizeUrl(cfg, state), 302);
  } catch (e) {
    return errorResponse(e);
  }
}
