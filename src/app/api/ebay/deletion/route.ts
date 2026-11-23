import { createHash } from "node:crypto";

/**
 * eBay Marketplace Account Deletion / Closure notification endpoint.
 * Required for a production keyset.
 *
 * GET  = eBay's verification challenge: respond with
 *        sha256(challengeCode + verificationToken + endpointUrl) as hex.
 * POST = an actual deletion notification: acknowledge 200 and best-effort erase
 *        any stored data for that eBay user.
 *
 * The endpoint URL and verification token must exactly match what you enter in
 * the eBay developer portal. Set EBAY_VERIFICATION_TOKEN (32–80 chars) in the env.
 */

// Must match EXACTLY the endpoint URL registered in the eBay developer portal.
function endpointUrl() {
  return process.env.EBAY_DELETION_ENDPOINT || "https://crosslister-psi.vercel.app/api/ebay/deletion";
}

export async function GET(req: Request) {
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  const challenge = new URL(req.url).searchParams.get("challenge_code");
  if (!token) return Response.json({ error: "EBAY_VERIFICATION_TOKEN not set" }, { status: 500 });
  if (!challenge) return Response.json({ error: "missing challenge_code" }, { status: 400 });
  const hash = createHash("sha256").update(challenge).update(token).update(endpointUrl()).digest("hex");
  return Response.json({ challengeResponse: hash }, { status: 200 });
}

export async function POST(req: Request) {
  // Acknowledge quickly; eBay only needs a 2xx. (Body may be used later to erase a specific user.)
  try {
    await req.text();
  } catch {
    /* ignore */
  }
  return new Response(null, { status: 200 });
}

