import { resolveListing } from "./resolve";
import { PLATFORM_LABEL, type ListingDraft, type Platform, type ResolvedListing } from "./types";

export interface Issue {
  platform: Platform;
  field: string;
  message: string;
  severity: "error" | "warning";
}

const EBAY_TITLE_MAX = 80; // eBay listing title limit
const EBAY_MAX_PHOTOS = 24; // eBay listing photo limit

function common(r: ResolvedListing, push: (field: string, message: string, sev?: Issue["severity"]) => void) {
  if (r.photos.length === 0) push("photoIds", "Add at least one photo");
  if (!r.title.trim()) push("title", "Title is required");
  if (!r.description.trim()) push("description", "Description is required");
  if (r.pricePence == null || r.pricePence <= 0) push("pricePence", "Price must be more than £0");
  if (!Number.isInteger(r.quantity) || r.quantity < 1) push("quantity", "Quantity must be a whole number of at least 1");
  if (!r.condition) push("condition", "Choose a condition");
}

function provenanceChecks(draft: ListingDraft, r: ResolvedListing, push: (f: string, m: string, s?: Issue["severity"]) => void) {
  const prov = draft.ai.provenance;
  // brand/attributes the AI guessed (not read from a label) must be confirmed before publishing
  if (r.brand && !r.overridden.includes("brand") && prov.brand === "ai_guess")
    push("brand", "Brand is an AI guess — confirm or clear it");
  for (const name of Object.keys(r.attributes)) {
    if (r.overriddenAttributes.includes(name)) continue;
    const p = prov[`attr:${name}`];
    if (p === "ai_guess") push(`attr:${name}`, `"${name}" is an AI guess — confirm or remove it`);
    else if (p === "ai_label" || p === "ai_visible")
      push(`attr:${name}`, `"${name}" came from the photos — check it's right`, "warning");
  }
}

export function validatePlatform(draft: ListingDraft, platform: Platform): Issue[] {
  const issues: Issue[] = [];
  const push = (field: string, message: string, severity: Issue["severity"] = "error") =>
    issues.push({ platform, field, message, severity });
  const r = resolveListing(draft, platform);
  common(r, push);
  provenanceChecks(draft, r, push);

  if (platform === "ebay") {
    const f = draft.platforms.ebay.fields;
    if (r.title.length > EBAY_TITLE_MAX) push("title", `eBay titles are max ${EBAY_TITLE_MAX} characters (${r.title.length} now)`);
    if (r.photos.length > EBAY_MAX_PHOTOS) push("photoIds", `eBay allows up to ${EBAY_MAX_PHOTOS} photos`);
    if (!f.categoryId) push("categoryId", "Choose an eBay category");
    if (!f.fulfillmentPolicyId) push("fulfillmentPolicyId", "Choose a postage (fulfilment) policy");
    if (!f.paymentPolicyId) push("paymentPolicyId", "Choose a payment policy");
    if (!f.returnPolicyId) push("returnPolicyId", "Choose a returns policy");
    if (!f.merchantLocationKey) push("merchantLocationKey", "Set your item location (Connections page)");
    const have = new Set(Object.keys(r.attributes).map((k) => k.toLowerCase()));
    if (r.brand) have.add("brand");
    for (const a of f.requiredAspects)
      if (!have.has(a.toLowerCase())) push(`attr:${a}`, `eBay requires "${a}" for this category`);
  }

  if (platform === "facebook") {
    const f = draft.platforms.facebook.fields;
    if (!f.category.trim()) push("category", "Choose a Facebook category");
    if ((f.delivery === "collection" || f.delivery === "both") && !f.collectionLocation.trim())
      push("collectionLocation", "Collection location is required for collection");
  }

  if (platform === "vinted") {
    const f = draft.platforms.vinted.fields;
    if (!f.category.trim()) push("category", "Choose a Vinted category");
    if (!f.parcelSize) push("parcelSize", "Choose a parcel size (Vinted is postage-only)");
    if (!f.size.trim()) push("size", "Size is required for most Vinted clothing categories", "warning");
  }

  return issues;
}

export function validateSelected(draft: ListingDraft): Issue[] {
  return (Object.keys(draft.platforms) as Platform[])
    .filter((p) => draft.platforms[p].enabled)
    .flatMap((p) => validatePlatform(draft, p));
}

export function blockingCount(issues: Issue[]) {
  return issues.filter((i) => i.severity === "error").length;
}

export function describeIssue(i: Issue) {
  return `${PLATFORM_LABEL[i.platform]}: ${i.message}`;
}
