import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/supabase/server";
import { emptyDraft, type ListingDraft } from "./types";

/** Merge a stored draft onto defaults so older rows gain new fields safely. */
export function normaliseDraft(raw: unknown): ListingDraft {
  const base = emptyDraft();
  const d = (raw ?? {}) as Partial<ListingDraft>;
  return {
    photos: d.photos ?? [],
    shared: { ...base.shared, ...(d.shared ?? {}) },
    platforms: {
      ebay: { ...base.platforms.ebay, ...(d.platforms?.ebay ?? {}), fields: { ...base.platforms.ebay.fields, ...(d.platforms?.ebay?.fields ?? {}) } },
      facebook: { ...base.platforms.facebook, ...(d.platforms?.facebook ?? {}), fields: { ...base.platforms.facebook.fields, ...(d.platforms?.facebook?.fields ?? {}) } },
      vinted: { ...base.platforms.vinted, ...(d.platforms?.vinted ?? {}), fields: { ...base.platforms.vinted.fields, ...(d.platforms?.vinted?.fields ?? {}) } },
    },
    ai: { ...base.ai, ...(d.ai ?? {}) },
  };
}

export async function loadListing(sb: SupabaseClient, id: string) {
  const { data, error } = await sb.from("listings").select("id, data, updated_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Listing not found"); // RLS hides other users' rows → 404, not 403
  return { id: data.id as string, draft: normaliseDraft(data.data), updatedAt: data.updated_at as string };
}
