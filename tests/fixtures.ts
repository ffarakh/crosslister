import { emptyDraft, type ListingDraft } from "@/lib/listing/types";

/** A complete, publishable draft for all three platforms. */
export function readyDraft(): ListingDraft {
  const d = emptyDraft();
  d.photos = [
    { id: "p1", path: "u1/l1/p1.jpg" },
    { id: "p2", path: "u1/l1/p2.jpg" },
  ];
  d.shared = {
    title: "Black wireless over-ear headphones with case",
    description: "Black over-ear headphones with carry case.\n\nLight scuffs on the headband.",
    pricePence: 3000,
    quantity: 1,
    condition: "used_good",
    brand: "",
    attributes: { Colour: "Black" },
    photoIds: ["p1", "p2"],
  };
  d.platforms.ebay = {
    enabled: true,
    overrides: {},
    fields: {
      categoryId: "112529",
      categoryName: "Sound & Vision › Headphones",
      requiredAspects: [],
      fulfillmentPolicyId: "F1",
      paymentPolicyId: "P1",
      returnPolicyId: "R1",
      merchantLocationKey: "home-dy81aa",
    },
  };
  d.platforms.facebook = { enabled: true, overrides: {}, fields: { category: "Electronics", delivery: "collection", collectionLocation: "Stourbridge" } };
  d.platforms.vinted = { enabled: true, overrides: {}, fields: { category: "Electronics › Audio", size: "One size", parcelSize: "medium" } };
  return d;
}
