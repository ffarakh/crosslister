import { z } from "zod";
import { loadListing } from "@/lib/listing/load";
import { contentHash, resolveListing } from "@/lib/listing/resolve";
import { PLATFORMS, type Platform } from "@/lib/listing/types";
import { adaptersFor } from "@/lib/publish/adapters";
import { publishListing } from "@/lib/publish/orchestrator";
import { SupabasePublishStore } from "@/lib/publish/supabase-store";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

const Body = z.object({
  confirmed: z.literal(true),
  // platform → content hash shown in the review. Guarantees what goes live is what was reviewed.
  // partialRecord: only the selected platforms need be present (z.record would demand all three in Zod 4).
  reviewed: z.partialRecord(z.enum(PLATFORMS), z.string()),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Publishing needs an explicit confirmation from the review screen");
    const { reviewed } = parsed.data;

    const { draft } = await loadListing(sb, id);
    const platforms = Object.keys(reviewed) as Platform[];
    if (!platforms.length) throw new HttpError(400, "Select at least one platform");

    for (const p of platforms) {
      if (!draft.platforms[p].enabled) throw new HttpError(400, `${p} isn't selected on this listing`);
      if ((await contentHash(resolveListing(draft, p))) !== reviewed[p])
        throw new HttpError(409, "The listing changed after you reviewed it. Review it again before publishing.");
    }

    const { adapters } = await adaptersFor(sb, user.id);
    const results = await publishListing({
      listingId: id,
      draft,
      platforms,
      adapters,
      store: new SupabasePublishStore(sb),
      photoUrlsFor: async (p) => {
        const r = resolveListing(draft, p);
        // Public URLs are short and stable — eBay caps each image URL at 500 chars
        // (signed URLs blow past that), so the photos bucket is public-read.
        return r.photos.map((ph) => sb.storage.from("photos").getPublicUrl(ph.path).data.publicUrl);
      },
    });
    return Response.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
