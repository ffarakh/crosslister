import { loadListing, normaliseDraft } from "@/lib/listing/load";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const sb = await supabaseServer();
    await requireUser(sb);
    const listing = await loadListing(sb, id);
    const { data: rows } = await sb
      .from("platform_listings")
      .select("platform, status, external_id, external_url, last_error, updated_at")
      .eq("listing_id", id);
    return Response.json({ ...listing, platformRows: rows ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const sb = await supabaseServer();
    await requireUser(sb);
    const body = (await req.json()) as { draft: unknown };
    const draft = normaliseDraft(body.draft);
    const { data, error } = await sb
      .from("listings")
      .update({ data: draft, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpError(404, "Listing not found");
    return Response.json({ updatedAt: data.updated_at });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const { draft } = await loadListing(sb, id);
    const { data: live } = await sb.from("platform_listings").select("platform").eq("listing_id", id).eq("status", "published");
    if (live?.length) throw new HttpError(409, "This item is live on a marketplace. End those listings first.");
    if (draft.photos.length) await sb.storage.from("photos").remove(draft.photos.map((p) => p.path).filter((p) => p.startsWith(`${user.id}/`)));
    const { error } = await sb.from("listings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
