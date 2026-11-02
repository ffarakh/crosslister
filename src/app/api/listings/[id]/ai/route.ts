import { applyAiResult, callVisionModel, type ImageInput } from "@/lib/ai/generate";
import { loadListing } from "@/lib/listing/load";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;
const MAX_AI_IMAGES = 8;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = await supabaseServer();
    await requireUser(sb);
    const { draft } = await loadListing(sb, id);
    if (!draft.photos.length) throw new HttpError(400, "Upload photos first");
    const { notes } = ((await req.json().catch(() => ({}))) ?? {}) as { notes?: string };

    // confirmed facts go to the model as ground truth
    const confirmed = Object.entries(draft.ai.provenance)
      .filter(([, p]) => p === "confirmed" || p === "user")
      .map(([k]) => {
        if (k.startsWith("attr:")) return `${k.slice(5)}: ${draft.shared.attributes[k.slice(5)] ?? ""}`;
        if (k === "brand") return `Brand: ${draft.shared.brand}`;
        return null;
      })
      .filter(Boolean)
      .join("\n");

    const ordered = draft.shared.photoIds.length
      ? draft.shared.photoIds.map((pid) => draft.photos.find((p) => p.id === pid)).filter(Boolean)
      : draft.photos;
    const images: ImageInput[] = [];
    for (const p of ordered.slice(0, MAX_AI_IMAGES)) {
      const { data, error } = await sb.storage.from("photos").download(p!.path);
      if (error || !data) throw new Error(`Couldn't read photo: ${error?.message}`);
      const type = (data.type || "image/jpeg") as ImageInput["mediaType"];
      images.push({ mediaType: type, base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
    }

    const result = await callVisionModel(images, [confirmed, notes].filter(Boolean).join("\n"));
    const next = applyAiResult(draft, result);
    const { error } = await sb.from("listings").update({ data: next, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    return Response.json({ draft: next });
  } catch (e) {
    return errorResponse(e);
  }
}
