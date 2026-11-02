/**
 * In-memory stand-in for the eBay Sell Inventory API endpoints the adapter uses,
 * following the documented request/response shapes. Supports fault injection.
 */
export type Fault =
  | { on: "publish"; kind: "timeout_after_commit" } // eBay creates the listing but the response is lost
  | { on: "publish"; kind: "timeout_before_commit" } // request never reaches eBay
  | { on: "publish"; kind: "error400"; message: string }
  | { on: "put_item"; kind: "error400"; message: string };

export class FakeEbay {
  items = new Map<string, unknown>();
  offers = new Map<string, { offerId: string; sku: string; body: unknown; status: "PUBLISHED" | "UNPUBLISHED"; listingId?: string }>();
  calls: { method: string; path: string; headers: Record<string, string>; body?: unknown }[] = [];
  faults: Fault[] = [];
  private seq = 1;
  publishCount = 0;

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    this.calls.push({ method, path: url.pathname + url.search, headers, body });
    const p = url.pathname;
    const json = (status: number, data?: unknown) =>
      new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    const take = (on: Fault["on"]) => {
      const i = this.faults.findIndex((f) => f.on === on);
      return i >= 0 ? this.faults.splice(i, 1)[0] : undefined;
    };

    let m: RegExpMatchArray | null;
    if ((m = p.match(/^\/sell\/inventory\/v1\/inventory_item\/(.+)$/)) && method === "PUT") {
      const f = take("put_item");
      if (f && f.kind === "error400") return json(400, { errors: [{ errorId: 25001, message: f.message }] });
      if (headers["Content-Language"] !== "en-GB") return json(400, { errors: [{ message: "Content-Language required" }] });
      this.items.set(decodeURIComponent(m[1]), body);
      return json(204);
    }
    if (p === "/sell/inventory/v1/offer" && method === "GET") {
      const sku = url.searchParams.get("sku");
      const list = [...this.offers.values()].filter((o) => o.sku === sku);
      if (!list.length) return json(404, { errors: [{ errorId: 25713, message: "This Offer is not available." }] });
      return json(200, {
        offers: list.map((o) => ({ offerId: o.offerId, sku: o.sku, status: o.status, listing: o.listingId ? { listingId: o.listingId, listingStatus: "ACTIVE" } : undefined })),
      });
    }
    if (p === "/sell/inventory/v1/offer" && method === "POST") {
      if ([...this.offers.values()].some((o) => o.sku === body.sku))
        return json(400, { errors: [{ errorId: 25002, message: "Offer entity already exists" }] });
      if (!this.items.has(body.sku)) return json(400, { errors: [{ message: "No inventory item" }] });
      const offerId = String(this.seq++);
      this.offers.set(offerId, { offerId, sku: body.sku, body, status: "UNPUBLISHED" });
      return json(201, { offerId });
    }
    if ((m = p.match(/^\/sell\/inventory\/v1\/offer\/([^/]+)$/)) && method === "PUT") {
      const o = this.offers.get(m[1]);
      if (!o) return json(404, { errors: [{ message: "not found" }] });
      o.body = body;
      return json(204);
    }
    if ((m = p.match(/^\/sell\/inventory\/v1\/offer\/([^/]+)\/publish$/)) && method === "POST") {
      const f = take("publish");
      if (f?.kind === "timeout_before_commit") throw new DOMException("The operation timed out.", "TimeoutError");
      if (f?.kind === "error400") return json(400, { errors: [{ errorId: 25007, message: f.message }] });
      const o = this.offers.get(m[1])!;
      if (o.status === "PUBLISHED") return json(200, { listingId: o.listingId });
      o.status = "PUBLISHED";
      o.listingId = String(110000000000 + this.publishCount++);
      if (f?.kind === "timeout_after_commit") throw new DOMException("The operation timed out.", "TimeoutError");
      return json(200, { listingId: o.listingId });
    }
    return json(404, { errors: [{ message: `unhandled ${method} ${p}` }] });
  };

  liveListings() {
    return [...this.offers.values()].filter((o) => o.status === "PUBLISHED");
  }
}
