import { EbayApi, EbayApiError, EbayTransportError, type EbayOffer } from "@/lib/ebay/api";
import { EBAY_CURRENCY, EBAY_LOCALE, EBAY_MARKETPLACE, ebayItemUrl, type EbayEnv } from "@/lib/ebay/config";
import type { Condition, ResolvedListing } from "@/lib/listing/types";
import type { Outcome, PlatformAdapter, PublishContext } from "./types";

export const EBAY_CONDITION: Record<Condition, string> = {
  new_sealed: "NEW",
  new_unsealed: "NEW_OTHER",
  new_with_defects: "NEW_WITH_DEFECTS",
  used_excellent: "USED_EXCELLENT",
  used_very_good: "USED_VERY_GOOD",
  used_good: "USED_GOOD",
  used_acceptable: "USED_ACCEPTABLE",
  for_parts: "FOR_PARTS_OR_NOT_WORKING",
};

/** Deterministic SKU: every retry for this listing targets the same eBay inventory item/offer. */
export const skuFor = (listingId: string) => `CL-${listingId}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const toEbayDescription = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");

export function buildInventoryItem(r: ResolvedListing, photoUrls: string[]) {
  const aspects: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(r.attributes)) if (v.trim()) aspects[k] = [v.trim()];
  if (r.brand.trim()) aspects["Brand"] = [r.brand.trim()];
  return {
    availability: { shipToLocationAvailability: { quantity: r.quantity } },
    condition: EBAY_CONDITION[r.condition!],
    product: {
      title: r.title.trim(),
      description: r.description.trim(),
      aspects,
      imageUrls: photoUrls,
      ...(r.brand.trim() ? { brand: r.brand.trim() } : {}),
    },
    locale: EBAY_LOCALE,
  };
}

export function buildOffer(r: ResolvedListing<"ebay">, sku: string) {
  const f = r.fields;
  return {
    sku,
    marketplaceId: EBAY_MARKETPLACE,
    format: "FIXED_PRICE",
    listingDuration: "GTC",
    availableQuantity: r.quantity,
    categoryId: f.categoryId,
    listingDescription: toEbayDescription(r.description),
    listingPolicies: {
      fulfillmentPolicyId: f.fulfillmentPolicyId,
      paymentPolicyId: f.paymentPolicyId,
      returnPolicyId: f.returnPolicyId,
    },
    merchantLocationKey: f.merchantLocationKey,
    pricingSummary: { price: { value: (r.pricePence! / 100).toFixed(2), currency: EBAY_CURRENCY } },
  };
}

const publishedOf = (offers: EbayOffer[]) => offers.find((o) => o.status === "PUBLISHED" && o.listing?.listingId);

function failed(e: unknown, step: string): Outcome {
  if (e instanceof EbayApiError)
    return { status: "failed", message: `eBay rejected ${step}: ${e.message}`, details: { httpStatus: e.status, errors: e.errors } };
  return { status: "failed", message: `${step} failed: ${(e as Error).message}` };
}

export function createEbayAdapter(opts: { api: EbayApi; env: EbayEnv }): PlatformAdapter {
  const { api, env } = opts;
  const done = (listingId: string, warnings?: string[]): Outcome => ({
    status: "published",
    externalId: listingId,
    url: ebayItemUrl(env, listingId),
    warnings,
  });

  return {
    platform: "ebay",
    integrationStatus: () => "implemented",

    async reconcile(listingId) {
      const offers = await api.getOffers(skuFor(listingId));
      const pub = publishedOf(offers);
      return pub ? done(pub.listing!.listingId!) : { status: "not_found" };
    },

    async publish(resolved, ctx: PublishContext) {
      const r = resolved as ResolvedListing<"ebay">;
      const sku = skuFor(ctx.listingId);

      // Steps before publishOffer create nothing buyers can see, so transport errors there are plain failures.
      let offers: EbayOffer[];
      try {
        offers = await api.getOffers(sku);
        const already = publishedOf(offers);
        if (already) return done(already.listing!.listingId!, ["Already live on eBay — no duplicate created"]);
        await api.putInventoryItem(sku, buildInventoryItem(r, ctx.photoUrls));
      } catch (e) {
        return failed(e, "saving the inventory item");
      }

      let offerId: string;
      const offerBody = buildOffer(r, sku);
      try {
        const existing = offers[0];
        if (existing) {
          await api.updateOffer(existing.offerId, offerBody);
          offerId = existing.offerId;
        } else {
          offerId = await api.createOffer(offerBody);
        }
      } catch (e) {
        // an offer may have been created by a lost earlier response — look again once
        const again = await api.getOffers(sku).catch(() => []);
        if (again[0]) {
          offerId = again[0].offerId;
          try {
            await api.updateOffer(offerId, offerBody);
          } catch (e2) {
            return failed(e2, "updating the offer");
          }
        } else return failed(e, "creating the offer");
      }

      try {
        const res = await api.publishOffer(offerId);
        const warnings = (res.warnings ?? []).map((w) => w.longMessage || w.message || "").filter(Boolean);
        return done(res.listingId, warnings.length ? warnings : undefined);
      } catch (e) {
        if (e instanceof EbayTransportError) {
          // The listing may or may not be live. Check immediately; otherwise report uncertain.
          try {
            const pub = publishedOf(await api.getOffers(sku));
            if (pub) return done(pub.listing!.listingId!);
          } catch {
            /* fall through */
          }
          return {
            status: "uncertain",
            message: `Lost contact with eBay while publishing (${e.message}). It may be live — it will be checked before any retry, so no duplicate will be created.`,
          };
        }
        return failed(e, "publishing the offer");
      }
    },
  };
}
