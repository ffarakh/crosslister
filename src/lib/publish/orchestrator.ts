import { contentHash, resolveListing } from "@/lib/listing/resolve";
import type { ListingDraft, Platform } from "@/lib/listing/types";
import { validatePlatform, type Issue } from "@/lib/listing/validate";
import type { Outcome, PlatformAdapter } from "./adapters/types";

export type PlatformRowStatus = "idle" | "submitting" | "published" | "failed" | "uncertain" | "blocked";

export interface ClaimResult {
  claimed: boolean;
  status: PlatformRowStatus;
  externalId: string | null;
  externalUrl: string | null;
  submittedAt: Date | null;
}

export interface PublishStore {
  claim(listingId: string, platform: Platform, hash: string): Promise<ClaimResult>;
  finish(listingId: string, platform: Platform, outcome: Outcome | { status: "failed"; message: string }): Promise<void>;
}

export type PlatformResult =
  | { platform: Platform; status: "published"; url: string; externalId: string; warnings?: string[] }
  | { platform: Platform; status: "already_published"; url: string | null; externalId: string | null }
  | { platform: Platform; status: "invalid"; issues: Issue[] }
  | { platform: Platform; status: "in_progress"; message: string }
  | { platform: Platform; status: "failed"; message: string; details?: unknown }
  | { platform: Platform; status: "uncertain"; message: string }
  | { platform: Platform; status: "blocked"; message: string; resolution: string };

/** A "submitting" row older than this is treated as a crashed attempt and reconciled. */
export const STALE_SUBMISSION_MS = 10 * 60 * 1000;

export interface PublishArgs {
  listingId: string;
  draft: ListingDraft;
  platforms: Platform[];
  adapters: Partial<Record<Platform, PlatformAdapter>>;
  store: PublishStore;
  photoUrlsFor: (platform: Platform) => Promise<string[]>;
  now?: () => Date;
}

/** Publish to each selected platform independently. One platform failing never blocks or undoes another. */
export async function publishListing(args: PublishArgs): Promise<PlatformResult[]> {
  const unique = [...new Set(args.platforms)];
  const settled = await Promise.allSettled(unique.map((p) => publishOne(args, p)));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { platform: unique[i], status: "uncertain", message: `Unexpected error: ${(s.reason as Error)?.message ?? s.reason}` },
  );
}

async function publishOne(args: PublishArgs, platform: Platform): Promise<PlatformResult> {
  const { listingId, draft, store } = args;
  const now = args.now ?? (() => new Date());

  const issues = validatePlatform(draft, platform);
  if (issues.some((i) => i.severity === "error")) return { platform, status: "invalid", issues };

  const adapter = args.adapters[platform];
  if (!adapter) return { platform, status: "failed", message: "This platform isn't connected." };

  const resolved = resolveListing(draft, platform);
  const hash = await contentHash(resolved);

  let claim = await store.claim(listingId, platform, hash);

  if (!claim.claimed) {
    if (claim.status === "published")
      return { platform, status: "already_published", url: claim.externalUrl, externalId: claim.externalId };

    const stale = claim.status === "submitting" && claim.submittedAt && now().getTime() - claim.submittedAt.getTime() > STALE_SUBMISSION_MS;
    if (claim.status === "submitting" && !stale)
      return { platform, status: "in_progress", message: "A submission for this platform is already running." };

    // uncertain (or a crashed attempt): never resubmit blind — ask the platform first.
    const check = await adapter.reconcile(listingId);
    if (check.status === "published") {
      await store.finish(listingId, platform, check);
      return { platform, status: "published", url: check.url, externalId: check.externalId, warnings: ["Confirmed live from an earlier attempt"] };
    }
    if (check.status !== "not_found") {
      // reconcile itself was inconclusive
      return { platform, status: "uncertain", message: "Couldn't confirm whether the earlier attempt went live. Check the platform before retrying." };
    }
    await store.finish(listingId, platform, { status: "failed", message: "Earlier attempt confirmed not live; retrying." });
    claim = await store.claim(listingId, platform, hash);
    if (!claim.claimed) return { platform, status: "in_progress", message: "Another submission started at the same time." };
  }

  let outcome: Outcome;
  try {
    const photoUrls = await args.photoUrlsFor(platform);
    outcome = await adapter.publish(resolved, { listingId, photoUrls });
  } catch (e) {
    // Unknown failure mode after claiming: be safe and require reconciliation.
    outcome = { status: "uncertain", message: `Unexpected error during submission: ${(e as Error).message}` };
  }
  await store.finish(listingId, platform, outcome);

  switch (outcome.status) {
    case "published":
      return { platform, status: "published", url: outcome.url, externalId: outcome.externalId, warnings: outcome.warnings };
    case "failed":
      return { platform, status: "failed", message: outcome.message, details: outcome.details };
    case "uncertain":
      return { platform, status: "uncertain", message: outcome.message };
    case "blocked":
      return { platform, status: "blocked", message: outcome.message, resolution: outcome.resolution };
  }
}

/** Reference in-memory store (used by tests; mirrors claim_platform_publish semantics). */
export class MemoryPublishStore implements PublishStore {
  rows = new Map<string, { status: PlatformRowStatus; externalId: string | null; externalUrl: string | null; submittedAt: Date | null; attempts: number }>();
  constructor(private now: () => Date = () => new Date()) {}
  private key = (l: string, p: Platform) => `${l}:${p}`;
  async claim(l: string, p: Platform): Promise<ClaimResult> {
    const k = this.key(l, p);
    const row = this.rows.get(k) ?? { status: "idle" as PlatformRowStatus, externalId: null, externalUrl: null, submittedAt: null, attempts: 0 };
    if (["idle", "failed", "blocked"].includes(row.status)) {
      const next = { ...row, status: "submitting" as PlatformRowStatus, submittedAt: this.now(), attempts: row.attempts + 1 };
      this.rows.set(k, next);
      return { claimed: true, status: "submitting", externalId: next.externalId, externalUrl: next.externalUrl, submittedAt: next.submittedAt };
    }
    this.rows.set(k, row);
    return { claimed: false, status: row.status, externalId: row.externalId, externalUrl: row.externalUrl, submittedAt: row.submittedAt };
  }
  async finish(l: string, p: Platform, o: Outcome | { status: "failed"; message: string }) {
    const k = this.key(l, p);
    const row = this.rows.get(k)!;
    this.rows.set(k, {
      ...row,
      status: o.status,
      externalId: o.status === "published" ? o.externalId : row.externalId,
      externalUrl: o.status === "published" ? o.url : row.externalUrl,
    });
  }
}
