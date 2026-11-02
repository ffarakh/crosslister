import type { Platform, ResolvedListing } from "@/lib/listing/types";

export type IntegrationStatus = "implemented" | "verified" | "awaiting_credentials" | "awaiting_approval" | "blocked";

export type Outcome =
  | { status: "published"; externalId: string; url: string; warnings?: string[] }
  | { status: "failed"; message: string; details?: unknown }
  | { status: "uncertain"; message: string }
  | { status: "blocked"; message: string; resolution: string };

export interface PublishContext {
  listingId: string;
  /** Short-lived HTTPS URLs for each photo, in listing order (cover first). */
  photoUrls: string[];
}

export interface PlatformAdapter {
  platform: Platform;
  integrationStatus(): IntegrationStatus;
  publish(resolved: ResolvedListing, ctx: PublishContext): Promise<Outcome>;
  /** Called when a previous attempt ended "uncertain": find out whether it actually went live. */
  reconcile(listingId: string): Promise<Outcome | { status: "not_found" }>;
}
