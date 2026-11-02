import {
  INHERITABLE_KEYS,
  type InheritableFields,
  type InheritableKey,
  type ListingDraft,
  type Platform,
  type ResolvedListing,
} from "./types";

const clone = <T>(v: T): T => structuredClone(v);

/** Final values for one platform: shared values, with that platform's explicit overrides on top. */
export function resolveListing<P extends Platform>(draft: ListingDraft, platform: P): ResolvedListing<P> {
  const cfg = draft.platforms[platform];
  const o = cfg.overrides;
  const out = clone(draft.shared) as InheritableFields;
  const overridden: InheritableKey[] = [];

  for (const key of INHERITABLE_KEYS) {
    if (key === "attributes") continue;
    if (Object.prototype.hasOwnProperty.call(o, key)) {
      (out as unknown as Record<string, unknown>)[key] = clone((o as Record<string, unknown>)[key]);
      overridden.push(key);
    }
  }
  const overriddenAttributes = Object.keys(o.attributes ?? {});
  out.attributes = { ...draft.shared.attributes, ...(o.attributes ?? {}) };
  // drop attributes cleared to "" on this platform
  for (const k of Object.keys(out.attributes)) if (out.attributes[k] === "") delete out.attributes[k];
  if (overriddenAttributes.length) overridden.push("attributes");

  const byId = new Map(draft.photos.map((p) => [p.id, p]));
  const photos = out.photoIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

  return { ...out, platform, fields: clone(cfg.fields), photos, overridden, overriddenAttributes };
}

/** Edit a value on a platform tab → creates/updates an override for that platform only. */
export function setOverride<K extends Exclude<InheritableKey, "attributes">>(
  draft: ListingDraft,
  platform: Platform,
  key: K,
  value: InheritableFields[K],
): ListingDraft {
  const next = clone(draft);
  (next.platforms[platform].overrides as Record<string, unknown>)[key] = clone(value);
  return next;
}

export function setAttributeOverride(draft: ListingDraft, platform: Platform, name: string, value: string): ListingDraft {
  const next = clone(draft);
  const o = next.platforms[platform].overrides;
  o.attributes = { ...(o.attributes ?? {}), [name]: value };
  return next;
}

/** "Reset to shared value". */
export function resetOverride(draft: ListingDraft, platform: Platform, key: InheritableKey): ListingDraft {
  const next = clone(draft);
  delete (next.platforms[platform].overrides as Record<string, unknown>)[key];
  return next;
}

export function resetAttributeOverride(draft: ListingDraft, platform: Platform, name: string): ListingDraft {
  const next = clone(draft);
  const o = next.platforms[platform].overrides;
  if (o.attributes) {
    delete o.attributes[name];
    if (!Object.keys(o.attributes).length) delete o.attributes;
  }
  return next;
}

/** Shared edits never touch overrides, so inheriting platforms update and overridden ones don't. */
export function setShared<K extends InheritableKey>(draft: ListingDraft, key: K, value: InheritableFields[K]): ListingDraft {
  const next = clone(draft);
  next.shared[key] = clone(value);
  return next;
}

export function isOverridden(draft: ListingDraft, platform: Platform, key: InheritableKey): boolean {
  return Object.prototype.hasOwnProperty.call(draft.platforms[platform].overrides, key);
}

/** Stable hash of exactly what will be submitted — used to detect "already published this content". */
export async function contentHash(resolved: ResolvedListing): Promise<string> {
  const { overridden: _o, overriddenAttributes: _oa, photos, ...rest } = resolved;
  const canonical = JSON.stringify(sortKeys({ ...rest, photos: photos.map((p) => p.id) }));
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export const formatPence = (p: number | null) => (p == null ? "—" : `£${(p / 100).toFixed(2)}`);
export function parsePounds(s: string): number | null {
  const t = s.replace(/[£,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
