import { EBAY_APP_SCOPE, EBAY_USER_SCOPES, type EbayConfig } from "./config";

export interface TokenSet {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken?: string;
  refreshExpiresAt?: Date;
  scopes?: string;
}

type Fetch = typeof fetch;

export function authorizeUrl(cfg: EbayConfig, state: string) {
  const u = new URL(`${cfg.authBase}/oauth2/authorize`);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.ruName); // eBay uses the RuName here, not a URL
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", EBAY_USER_SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(cfg: EbayConfig, body: URLSearchParams, f: Fetch): Promise<TokenSet> {
  const res = await f(`${cfg.apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`eBay token error ${res.status}: ${json.error_description ?? json.error ?? "unknown"}`);
  const now = Date.now();
  return {
    accessToken: String(json.access_token),
    accessExpiresAt: new Date(now + Number(json.expires_in ?? 7200) * 1000),
    refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
    refreshExpiresAt: json.refresh_token_expires_in
      ? new Date(now + Number(json.refresh_token_expires_in) * 1000)
      : undefined,
  };
}

export function exchangeCode(cfg: EbayConfig, code: string, f: Fetch = fetch) {
  return tokenRequest(
    cfg,
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.ruName }),
    f,
  );
}

export function refreshAccessToken(cfg: EbayConfig, refreshToken: string, f: Fetch = fetch) {
  return tokenRequest(
    cfg,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: EBAY_USER_SCOPES.join(" ") }),
    f,
  );
}

let appToken: { token: string; exp: number; env: string } | null = null;
/** Client-credentials token for public metadata (Taxonomy API). */
export async function getAppToken(cfg: EbayConfig, f: Fetch = fetch) {
  if (appToken && appToken.env === cfg.env && appToken.exp > Date.now() + 60_000) return appToken.token;
  const t = await tokenRequest(cfg, new URLSearchParams({ grant_type: "client_credentials", scope: EBAY_APP_SCOPE }), f);
  appToken = { token: t.accessToken, exp: t.accessExpiresAt.getTime(), env: cfg.env };
  return t.accessToken;
}
