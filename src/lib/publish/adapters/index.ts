import type { SupabaseClient } from "@supabase/supabase-js";
import { ebayApiFor } from "@/lib/ebay/connection";
import { EbayConfigError } from "@/lib/ebay/config";
import type { Platform } from "@/lib/listing/types";
import { facebookAdapter, vintedAdapter } from "./blocked";
import { createEbayAdapter } from "./ebay";
import type { IntegrationStatus, PlatformAdapter } from "./types";

export async function adaptersFor(sb: SupabaseClient, userId: string) {
  const adapters: Partial<Record<Platform, PlatformAdapter>> = { facebook: facebookAdapter, vinted: vintedAdapter };
  const status: Record<Platform, { status: IntegrationStatus; note: string }> = {
    ebay: { status: "awaiting_credentials", note: "" },
    facebook: { status: "awaiting_approval", note: "No approved listing API for your account" },
    vinted: { status: "awaiting_approval", note: "Needs Vinted Pro + Vinted Pro Integrations allowlisting" },
  };
  try {
    const conn = await ebayApiFor(sb, userId);
    if (conn) {
      adapters.ebay = createEbayAdapter({ api: conn.api, env: conn.cfg.env });
      status.ebay = { status: "implemented", note: `Connected (${conn.cfg.env})` };
    } else status.ebay = { status: "awaiting_credentials", note: "Connect your eBay account on the Connections page" };
  } catch (e) {
    status.ebay = {
      status: "awaiting_credentials",
      note: e instanceof EbayConfigError ? e.message : `eBay connection error: ${(e as Error).message}`,
    };
  }
  return { adapters, status };
}
