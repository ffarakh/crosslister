import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/supabase/server";

/** Fixed-window per-user rate limit, enforced in Postgres. Throws 429 when exceeded. */
export async function rateLimit(sb: SupabaseClient, bucket: string, max: number, windowSeconds: number) {
  const { data, error } = await sb.rpc("bump_rate_limit", { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds });
  if (error) return; // fail open on limiter errors — never block legitimate use on infra hiccups
  if (data === false) throw new HttpError(429, "You're doing that too often. Please wait a little and try again.");
}
