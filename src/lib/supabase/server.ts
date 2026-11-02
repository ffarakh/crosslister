import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * User-scoped client: every query runs as the signed-in user, so Postgres RLS enforces data isolation.
 * There is deliberately no service-role key anywhere in this app.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — middleware refreshes the session instead */
        }
      },
    },
  });
}

export async function requireUser(sb: SupabaseClient) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  return data.user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Unexpected error";
  if (status === 500) console.error(e);
  return Response.json({ error: message }, { status });
}
