import { describe, expect, it } from "vitest";
import { EbayApi } from "@/lib/ebay/api";
import type { EbayConfig } from "@/lib/ebay/config";
import { setOverride } from "@/lib/listing/resolve";
import { facebookAdapter, vintedAdapter } from "@/lib/publish/adapters/blocked";
import { createEbayAdapter, skuFor } from "@/lib/publish/adapters/ebay";
import type { PlatformAdapter } from "@/lib/publish/adapters/types";
import { MemoryPublishStore, publishListing, STALE_SUBMISSION_MS, type PublishArgs } from "@/lib/publish/orchestrator";
import { FakeEbay } from "./fake-ebay";
import { readyDraft } from "./fixtures";

const cfg: EbayConfig = {
  env: "sandbox",
  clientId: "id",
  clientSecret: "secret",
  ruName: "ru",
  apiBase: "https://api.sandbox.ebay.com",
  authBase: "https://auth.sandbox.ebay.com",
};

function setup(draft = readyDraft()) {
  const ebay = new FakeEbay();
  const store = new MemoryPublishStore();
  const adapter = createEbayAdapter({ api: new EbayApi(cfg, "user-token", ebay.fetch), env: "sandbox" });
  const args: PublishArgs = {
    listingId: "11111111-2222-3333-4444-555555555555",
    draft,
    platforms: ["ebay", "facebook", "vinted"],
    adapters: { ebay: adapter, facebook: facebookAdapter, vinted: vintedAdapter },
    store,
    photoUrlsFor: async () => ["https://img.example/p1.jpg", "https://img.example/p2.jpg"],
  };
  return { ebay, store, args };
}

describe("eBay adapter (against a fake Inventory API)", () => {
  it("creates inventory item → offer → publish with the resolved eBay values", async () => {
    const { ebay, args } = setup(setOverride(readyDraft(), "ebay", "pricePence", 3000));
    const [res] = await publishListing({ ...args, platforms: ["ebay"] });
    expect(res).toMatchObject({ platform: "ebay", status: "published", url: expect.stringContaining("/itm/") });

    const sku = skuFor(args.listingId);
    const item = ebay.items.get(sku) as any;
    expect(item.condition).toBe("USED_GOOD");
    expect(item.product.title).toBe(args.draft.shared.title);
    expect(item.product.imageUrls).toEqual(["https://img.example/p1.jpg", "https://img.example/p2.jpg"]);
    expect(item.product.aspects).toEqual({ Colour: ["Black"] });

    const offer = [...ebay.offers.values()][0].body as any;
    expect(offer).toMatchObject({
      sku,
      marketplaceId: "EBAY_GB",
      format: "FIXED_PRICE",
      categoryId: "112529",
      merchantLocationKey: "home-dy81aa",
      pricingSummary: { price: { value: "30.00", currency: "GBP" } },
      listingPolicies: { fulfillmentPolicyId: "F1", paymentPolicyId: "P1", returnPolicyId: "R1" },
    });
    expect(offer.listingDescription).toContain("<p>Light scuffs on the headband.</p>");
    expect(ebay.calls.every((c) => c.headers.Authorization === "Bearer user-token")).toBe(true);
  });

  it("escapes HTML in the description", async () => {
    const d = readyDraft();
    d.shared.description = "<script>x</script> & more";
    const { ebay, args } = setup(d);
    await publishListing({ ...args, platforms: ["ebay"] });
    expect(([...ebay.offers.values()][0].body as any).listingDescription).toBe("<p>&lt;script&gt;x&lt;/script&gt; &amp; more</p>");
  });

  it("reports eBay's own error message when eBay rejects the listing", async () => {
    const { ebay, args, store } = setup();
    ebay.faults.push({ on: "publish", kind: "error400", message: "The item specific Brand is missing." });
    const [res] = await publishListing({ ...args, platforms: ["ebay"] });
    expect(res).toMatchObject({ status: "failed", message: expect.stringContaining("Brand is missing") });
    expect(store.rows.get(`${args.listingId}:ebay`)?.status).toBe("failed");
    expect(ebay.liveListings()).toHaveLength(0);
  });
});

describe("partial publishing failures", () => {
  it("one platform failing doesn't stop the others; each gets its own accurate result", async () => {
    const { ebay, args } = setup();
    const results = await publishListing(args);
    const by = Object.fromEntries(results.map((r) => [r.platform, r]));
    expect(by.ebay.status).toBe("published");
    expect(by.facebook).toMatchObject({ status: "blocked", resolution: expect.stringContaining("Partner") });
    expect(by.vinted).toMatchObject({ status: "blocked", resolution: expect.stringContaining("Vinted Pro") });
    expect(ebay.liveListings()).toHaveLength(1);
  });

  it("an eBay failure is reported while blocked platforms still report their blocker", async () => {
    const { ebay, args } = setup();
    ebay.faults.push({ on: "put_item", kind: "error400", message: "Invalid condition for category" });
    const results = await publishListing(args);
    expect(results.find((r) => r.platform === "ebay")).toMatchObject({ status: "failed", message: expect.stringContaining("Invalid condition") });
    expect(results.filter((r) => r.status === "blocked")).toHaveLength(2);
  });

  it("a platform with validation errors is not submitted at all, others still go", async () => {
    const d = setOverride(readyDraft(), "vinted", "pricePence", null);
    const { ebay, args, store } = setup(d);
    const results = await publishListing(args);
    expect(results.find((r) => r.platform === "vinted")?.status).toBe("invalid");
    expect(store.rows.has(`${args.listingId}:vinted`)).toBe(false); // never claimed
    expect(results.find((r) => r.platform === "ebay")?.status).toBe("published");
    expect(ebay.liveListings()).toHaveLength(1);
  });

  it("a crashing adapter is reported as uncertain, not success or silent failure", async () => {
    const { args } = setup();
    const boom: PlatformAdapter = { ...facebookAdapter, publish: async () => { throw new Error("socket hang up"); } };
    const [res] = await publishListing({ ...args, platforms: ["facebook"], adapters: { facebook: boom } });
    expect(res).toMatchObject({ status: "uncertain", message: expect.stringContaining("socket hang up") });
  });

  it("an unconnected platform reports that clearly", async () => {
    const { args } = setup();
    const [res] = await publishListing({ ...args, platforms: ["ebay"], adapters: {} });
    expect(res).toMatchObject({ status: "failed", message: expect.stringContaining("isn't connected") });
  });
});

describe("duplicate prevention", () => {
  it("publishing twice never creates a second live listing", async () => {
    const { ebay, args } = setup();
    await publishListing({ ...args, platforms: ["ebay"] });
    const [again] = await publishListing({ ...args, platforms: ["ebay"] });
    expect(again).toMatchObject({ status: "already_published", url: expect.stringContaining("/itm/") });
    expect(ebay.liveListings()).toHaveLength(1);
    expect(ebay.calls.filter((c) => c.path.endsWith("/publish"))).toHaveLength(1);
  });

  it("two simultaneous publish clicks produce one submission", async () => {
    const { ebay, args } = setup();
    const [a, b] = await Promise.all([publishListing({ ...args, platforms: ["ebay"] }), publishListing({ ...args, platforms: ["ebay"] })]);
    const statuses = [a[0].status, b[0].status];
    expect(statuses.filter((s) => s === "published")).toHaveLength(1);
    expect(statuses.filter((s) => s === "in_progress" || s === "already_published")).toHaveLength(1);
    expect(ebay.liveListings()).toHaveLength(1);
    expect(ebay.calls.filter((c) => c.path.endsWith("/publish"))).toHaveLength(1);
  });

  it("if our record is lost but eBay already has the listing, the adapter detects it instead of duplicating", async () => {
    const { ebay, args } = setup();
    await publishListing({ ...args, platforms: ["ebay"] });
    const fresh = { ...args, store: new MemoryPublishStore() }; // simulates lost local state
    const [res] = await publishListing({ ...fresh, platforms: ["ebay"] });
    expect(res).toMatchObject({ status: "published", warnings: [expect.stringContaining("no duplicate")] });
    expect(ebay.liveListings()).toHaveLength(1);
  });

  it("the same listing id always maps to the same SKU", () => {
    expect(skuFor("abc")).toBe(skuFor("abc"));
    expect(skuFor("abc").length).toBeLessThanOrEqual(50);
  });
});

describe("uncertain submission results", () => {
  it("timeout after eBay committed: detected immediately as published (no retry needed)", async () => {
    const { ebay, args } = setup();
    ebay.faults.push({ on: "publish", kind: "timeout_after_commit" });
    const [res] = await publishListing({ ...args, platforms: ["ebay"] });
    expect(res.status).toBe("published");
    expect(ebay.liveListings()).toHaveLength(1);
  });

  it("timeout where eBay can't confirm: reported uncertain, then reconciled before any retry", async () => {
    const { ebay, args, store } = setup();
    ebay.faults.push({ on: "publish", kind: "timeout_before_commit" });
    // make the immediate post-timeout check also fail so the outcome stays unknown
    const realFetch = ebay.fetch;
    let failNextGet = false;
    const flaky: typeof fetch = async (i, init) => {
      if (failNextGet && (init?.method ?? "GET") === "GET") { failNextGet = false; throw new TypeError("network down"); }
      if (String(i).endsWith("/publish")) failNextGet = true;
      return realFetch(i, init);
    };
    const adapter = createEbayAdapter({ api: new EbayApi(cfg, "t", flaky), env: "sandbox" });
    const [first] = await publishListing({ ...args, platforms: ["ebay"], adapters: { ebay: adapter } });
    expect(first.status).toBe("uncertain");
    expect(store.rows.get(`${args.listingId}:ebay`)?.status).toBe("uncertain");
    expect(ebay.liveListings()).toHaveLength(0);

    // retry: orchestrator reconciles (not live) → safe resubmit → exactly one listing
    const [second] = await publishListing({ ...args, platforms: ["ebay"], adapters: { ebay: adapter } });
    expect(second.status).toBe("published");
    expect(ebay.liveListings()).toHaveLength(1);
  });

  it("uncertain that actually went live is confirmed on reconcile, never resubmitted", async () => {
    const { ebay, args, store } = setup();
    await publishListing({ ...args, platforms: ["ebay"] });
    store.rows.get(`${args.listingId}:ebay`)!.status = "uncertain";
    const publishesBefore = ebay.calls.filter((c) => c.path.endsWith("/publish")).length;
    const [res] = await publishListing({ ...args, platforms: ["ebay"] });
    expect(res).toMatchObject({ status: "published", warnings: [expect.stringContaining("earlier attempt")] });
    expect(ebay.calls.filter((c) => c.path.endsWith("/publish")).length).toBe(publishesBefore);
  });

  it("a stale in-flight submission (crash) is reconciled; a fresh one is left alone", async () => {
    let t = new Date("2026-11-01T12:00:00Z");
    const { ebay, args } = setup();
    const store = new MemoryPublishStore(() => t);
    await store.claim(args.listingId, "ebay"); // simulated crash mid-submission
    const [busy] = await publishListing({ ...args, store, platforms: ["ebay"], now: () => t });
    expect(busy.status).toBe("in_progress");
    t = new Date(t.getTime() + STALE_SUBMISSION_MS + 1000);
    const [res] = await publishListing({ ...args, store, platforms: ["ebay"], now: () => t });
    expect(res.status).toBe("published");
    expect(ebay.liveListings()).toHaveLength(1);
  });
});
