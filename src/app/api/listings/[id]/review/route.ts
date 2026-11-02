import { loadListing } from "@/lib/listing/load";
import { contentHash, resolveListing } from "@/lib/listing/resolve";
import { PLATFORMS } from "@/lib/listing/types";
import { validatePlatform } from "@/lib/listing/validate";
import { adaptersFor } from "@/lib/publish/adapters";
import { errorResponse, requireUser, supabaseServer } from "@/lib/supabase/server";

/** Final per-platform versions + their hashes. The client sends these hashes back on publish. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const { draft } = await loadListing(sb, id);
    const { status } = await adaptersFor(sb, user.id);
    const platforms = await Promise.all(
      PLATFORMS.filter((p) => draft.platforms[p].enabled).map(async (p) => {
        const resolved = resolveListing(draft, p);
        const photoUrls = await Promise.all(
          resolved.photos.map(async (ph) => (await sb.storage.from("photos").createSignedUrl(ph.path, 600)).data?.signedUrl ?? null),
        );
        return {
          platform: p,
          resolved,
          photoUrls,
          hash: await contentHash(resolved),
          issues: validatePlatform(draft, p),
          integration: status[p],
        };
      }),
    );
    return Response.json({ platforms });
  } catch (e) {
    return errorResponse(e);
  }
}
