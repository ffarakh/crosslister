import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { EbayApi } from "./api";
import { ebayConfig, EBAY_USER_SCOPES, type EbayConfig } from "./config";
import { refreshAccessToken, type TokenSet } from "./oauth";

export interface EbayDefaults {
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  merchantLocationKey?: string;
}

export async function saveTokens(sb: SupabaseClient, userId: string, cfg: EbayConfig, t: TokenSet, prevRefreshEnc?: string) {
  const row: Record<string, unknown> = {
    user_id: userId,
    env: cfg.env,
    access_token_enc: encrypt(t.accessToken),
    access_expires_at: t.accessExpiresAt.toISOString(),
    scopes: EBAY_USER_SCOPES.join(" "),
    updated_at: new Date().toISOString(),
  };
  if (t.refreshToken) {
    row.refresh_token_enc = encrypt(t.refreshToken);
    row.refresh_expires_at = t.refreshExpiresAt?.toISOString() ?? null;
  } else if (prevRefreshEnc) row.refresh_token_enc = prevRefreshEnc;
  const { error } = await sb.from("ebay_connections").upsert(row);
  if (error) throw new Error(`Saving eBay connection failed: ${error.message}`);
}

/** Returns an EbayApi with a valid access token (refreshing if needed), or null if not connected. */
export async function ebayApiFor(sb: SupabaseClient, userId: string): Promise<{ api: EbayApi; cfg: EbayConfig; defaults: EbayDefaults } | null> {
  const cfg = ebayConfig();
  const { data } = await sb.from("ebay_connections").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  if (data.env !== cfg.env) return null; // connected to the other environment
  let token = decrypt(data.access_token_enc);
  if (new Date(data.access_expires_at).getTime() < Date.now() + 120_000) {
    const fresh = await refreshAccessToken(cfg, decrypt(data.refresh_token_enc));
    await saveTokens(sb, userId, cfg, fresh, data.refresh_token_enc);
    token = fresh.accessToken;
  }
  return { api: new EbayApi(cfg, token), cfg, defaults: (data.defaults ?? {}) as EbayDefaults };
}
