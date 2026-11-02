import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "@/lib/listing/types";
import type { Outcome } from "./adapters/types";
import type { ClaimResult, PublishStore } from "./orchestrator";

export class SupabasePublishStore implements PublishStore {
  constructor(private sb: SupabaseClient) {}

  async claim(listingId: string, platform: Platform, hash: string): Promise<ClaimResult> {
    const { data, error } = await this.sb.rpc("claim_platform_publish", {
      p_listing: listingId,
      p_platform: platform,
      p_hash: hash,
    });
    if (error) throw new Error(`Claim failed: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as {
      claimed: boolean;
      status: ClaimResult["status"];
      external_id: string | null;
      external_url: string | null;
      submitted_at: string | null;
    };
    return {
      claimed: row.claimed,
      status: row.status,
      externalId: row.external_id,
      externalUrl: row.external_url,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
    };
  }

  async finish(listingId: string, platform: Platform, o: Outcome | { status: "failed"; message: string }) {
    const patch: Record<string, unknown> = { status: o.status, updated_at: new Date().toISOString() };
    if (o.status === "published") {
      patch.external_id = o.externalId;
      patch.external_url = o.url;
      patch.last_error = null;
    } else {
      patch.last_error = o;
    }
    const { error } = await this.sb.from("platform_listings").update(patch).eq("listing_id", listingId).eq("platform", platform);
    if (error) throw new Error(`Saving result failed: ${error.message}`);
    await this.sb.from("publish_events").insert({ listing_id: listingId, platform, status: o.status, detail: o });
  }
}
