import { cookies } from "next/headers";
import { ebayConfig } from "@/lib/ebay/config";
import { saveTokens } from "@/lib/ebay/connection";
import { exchangeCode } from "@/lib/ebay/oauth";
import { requireUser, supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (msg: string) => Response.redirect(new URL(`/connections?ebay=${encodeURIComponent(msg)}`, process.env.APP_URL || url.origin), 302);
  try {
    const jar = await cookies();
    const expected = jar.get("ebay_oauth_state")?.value;
    jar.delete("ebay_oauth_state");
    if (url.searchParams.get("error")) return back(`declined: ${url.searchParams.get("error")}`);
    const code = url.searchParams.get("code");
    if (!code || !expected || url.searchParams.get("state") !== expected) return back("invalid state — try connecting again");

    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const cfg = ebayConfig();
    const tokens = await exchangeCode(cfg, code);
    if (!tokens.refreshToken) return back("eBay returned no refresh token");
    await saveTokens(sb, user.id, cfg, tokens);
    return back("connected");
  } catch (e) {
    console.error(e);
    return back(`error: ${(e as Error).message}`);
  }
}
