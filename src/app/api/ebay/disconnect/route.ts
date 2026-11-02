import { errorResponse, requireUser, supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const { error } = await sb.from("ebay_connections").delete().eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
