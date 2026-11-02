import { z } from "zod";
import { errorResponse, HttpError, requireUser, supabaseServer } from "@/lib/supabase/server";

const Body = z.object({
  fulfillmentPolicyId: z.string().optional(),
  paymentPolicyId: z.string().optional(),
  returnPolicyId: z.string().optional(),
  merchantLocationKey: z.string().optional(),
});

export async function PUT(req: Request) {
  try {
    const sb = await supabaseServer();
    const user = await requireUser(sb);
    const body = Body.parse(await req.json());
    const { data, error } = await sb.from("ebay_connections").update({ defaults: body }).eq("user_id", user.id).select("user_id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new HttpError(400, "Connect eBay first");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
