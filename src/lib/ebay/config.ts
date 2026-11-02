export type EbayEnv = "sandbox" | "production";

export interface EbayConfig {
  env: EbayEnv;
  clientId: string;
  clientSecret: string;
  ruName: string;
  apiBase: string;
  authBase: string;
}

export const EBAY_MARKETPLACE = "EBAY_GB";
export const EBAY_LOCALE = "en-GB";
export const EBAY_CURRENCY = "GBP";

export const EBAY_USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
];
export const EBAY_APP_SCOPE = "https://api.ebay.com/oauth/api_scope";

export function ebayConfig(env: NodeJS.ProcessEnv = process.env): EbayConfig {
  const e = (env.EBAY_ENV === "production" ? "production" : "sandbox") as EbayEnv;
  const missing = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RUNAME"].filter((k) => !env[k]);
  if (missing.length) throw new EbayConfigError(`Missing eBay credentials: ${missing.join(", ")}`);
  return {
    env: e,
    clientId: env.EBAY_CLIENT_ID!,
    clientSecret: env.EBAY_CLIENT_SECRET!,
    ruName: env.EBAY_RUNAME!,
    apiBase: e === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com",
    authBase: e === "production" ? "https://auth.ebay.com" : "https://auth.sandbox.ebay.com",
  };
}

export class EbayConfigError extends Error {}

export function ebayItemUrl(env: EbayEnv, listingId: string) {
  return env === "production"
    ? `https://www.ebay.co.uk/itm/${listingId}`
    : `https://www.sandbox.ebay.co.uk/itm/${listingId}`;
}
