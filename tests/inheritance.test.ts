import { describe, expect, it } from "vitest";
import {
  contentHash,
  isOverridden,
  resetAttributeOverride,
  resetOverride,
  resolveListing,
  setAttributeOverride,
  setOverride,
  setShared,
} from "@/lib/listing/resolve";
import { readyDraft } from "./fixtures";

describe("shared-field inheritance and platform overrides", () => {
  it("every platform inherits shared values by default", () => {
    const d = readyDraft();
    for (const p of ["ebay", "facebook", "vinted"] as const) {
      const r = resolveListing(d, p);
      expect(r.title).toBe(d.shared.title);
      expect(r.description).toBe(d.shared.description);
      expect(r.pricePence).toBe(3000);
      expect(r.photos.map((x) => x.id)).toEqual(["p1", "p2"]);
      expect(r.overridden).toEqual([]);
    }
  });

  it("the spec example: same description everywhere, £30 eBay, £25 Vinted, collection-only Facebook", () => {
    let d = readyDraft();
    d = setOverride(d, "vinted", "pricePence", 2500);
    const ebay = resolveListing(d, "ebay");
    const vinted = resolveListing(d, "vinted");
    const fb = resolveListing(d, "facebook");
    expect(ebay.pricePence).toBe(3000);
    expect(vinted.pricePence).toBe(2500);
    expect(new Set([ebay.description, vinted.description, fb.description]).size).toBe(1);
    expect(fb.fields.delivery).toBe("collection");
    expect(vinted.overridden).toEqual(["pricePence"]);
  });

  it("an override affects only its own platform", () => {
    const d = setOverride(readyDraft(), "ebay", "title", "eBay-only title");
    expect(resolveListing(d, "ebay").title).toBe("eBay-only title");
    expect(resolveListing(d, "facebook").title).toBe(readyDraft().shared.title);
    expect(resolveListing(d, "vinted").title).toBe(readyDraft().shared.title);
  });

  it("later shared edits flow to inheriting platforms but never replace explicit overrides", () => {
    let d = setOverride(readyDraft(), "vinted", "pricePence", 2500);
    d = setShared(d, "pricePence", 3500);
    d = setShared(d, "description", "Updated description");
    expect(resolveListing(d, "ebay").pricePence).toBe(3500);
    expect(resolveListing(d, "facebook").pricePence).toBe(3500);
    expect(resolveListing(d, "vinted").pricePence).toBe(2500);
    expect(resolveListing(d, "vinted").description).toBe("Updated description");
  });

  it("overriding with the same value as shared still counts as an explicit override", () => {
    let d = setOverride(readyDraft(), "ebay", "pricePence", 3000);
    d = setShared(d, "pricePence", 4000);
    expect(resolveListing(d, "ebay").pricePence).toBe(3000);
  });

  it("reset to shared value removes the override and re-inherits", () => {
    let d = setOverride(readyDraft(), "ebay", "pricePence", 9999);
    d = resetOverride(d, "ebay", "pricePence");
    expect(isOverridden(d, "ebay", "pricePence")).toBe(false);
    d = setShared(d, "pricePence", 1234);
    expect(resolveListing(d, "ebay").pricePence).toBe(1234);
  });

  it("attribute overrides are per attribute; other attributes keep inheriting", () => {
    let d = setShared(readyDraft(), "attributes", { Colour: "Black", Model: "X100" });
    d = setAttributeOverride(d, "ebay", "Colour", "Jet Black");
    d = setShared(d, "attributes", { Colour: "Grey", Model: "X200" });
    expect(resolveListing(d, "ebay").attributes).toEqual({ Colour: "Jet Black", Model: "X200" });
    expect(resolveListing(d, "vinted").attributes).toEqual({ Colour: "Grey", Model: "X200" });
    d = resetAttributeOverride(d, "ebay", "Colour");
    expect(resolveListing(d, "ebay").attributes.Colour).toBe("Grey");
    expect(d.platforms.ebay.overrides.attributes).toBeUndefined();
  });

  it("clearing an attribute on one platform removes it there only", () => {
    const d = setAttributeOverride(readyDraft(), "facebook", "Colour", "");
    expect(resolveListing(d, "facebook").attributes).toEqual({});
    expect(resolveListing(d, "ebay").attributes).toEqual({ Colour: "Black" });
  });

  it("photos are identical everywhere unless a platform overrides the order", () => {
    let d = readyDraft();
    d = setShared(d, "photoIds", ["p2", "p1"]);
    expect(resolveListing(d, "vinted").photos.map((p) => p.id)).toEqual(["p2", "p1"]);
    d = setOverride(d, "ebay", "photoIds", ["p1"]);
    expect(resolveListing(d, "ebay").photos.map((p) => p.id)).toEqual(["p1"]);
    expect(resolveListing(d, "facebook").photos.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("does not mutate the input draft", () => {
    const d = readyDraft();
    const before = JSON.stringify(d);
    setOverride(d, "ebay", "title", "x");
    setShared(d, "title", "y");
    resolveListing(d, "ebay").attributes.Colour = "mutated";
    expect(JSON.stringify(d)).toBe(before);
  });

  it("content hash is stable and changes when the submitted content changes", async () => {
    const d = readyDraft();
    const a = await contentHash(resolveListing(d, "ebay"));
    expect(await contentHash(resolveListing(structuredClone(d), "ebay"))).toBe(a);
    expect(await contentHash(resolveListing(setShared(d, "title", "Other"), "ebay"))).not.toBe(a);
    // a Vinted-only change does not alter eBay's content
    expect(await contentHash(resolveListing(setOverride(d, "vinted", "pricePence", 1), "ebay"))).toBe(a);
  });
});
