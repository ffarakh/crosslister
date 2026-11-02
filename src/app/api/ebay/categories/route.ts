import { EbayApi } from "@/lib/ebay/api";
import { ebayConfig } from "@/lib/ebay/config";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const sb = await supabaseServer();
    await requireUser(sb);
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) throw new HttpError(400, "Missing q");
    const api = new EbayApi(ebayConfig(), ""); // taxonomy calls use the app token
    return Response.json({ categories: (await api.suggestCategories(q)).slice(0, 10) });
  } catch (e) {
    return errorResponse(e);
  }
}
