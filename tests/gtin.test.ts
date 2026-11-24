import { describe, expect, it } from "vitest";
import { isValidGtin } from "@/lib/listing/gtin";
import { buildAspects, buildInventoryItem } from "@/lib/publish/adapters/ebay";
import { resolveListing } from "@/lib/listing/resolve";
import { readyDraft } from "./fixtures";

describe("barcode check digit", () => {
  it("accepts valid UPC/EAN codes", () => {
    expect(isValidGtin("810144373539")).toBe(true); // UPC-A
    expect(isValidGtin("5012345678900")).toBe(true); // EAN-13
    expect(isValidGtin("96385074")).toBe(true); // EAN-8
  });
  it("rejects misread codes", () => {
    expect(isValidGtin("810144373353")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
  });
});

describe("eBay inventory item safety", () => {
  it("never sends reserved/duplicate specifics like Condition or the barcode as aspects", () => {
    const d = readyDraft();
    d.shared.attributes = { Colour: "Black", Condition: "New, boxed, sealed", "EAN/UPC": "810144373539", "Long name that goes well past forty characters total": "x" };
    const a = buildAspects(resolveListing(d, "ebay"));
    expect(a.Condition).toBeUndefined();
    expect(a["EAN/UPC"]).toBeUndefined();
    expect(Object.keys(a).every((k) => k.length <= 40)).toBe(true);
  });
  it("sends a valid barcode as UPC but drops an invalid one", () => {
    const d = readyDraft();
    d.shared.attributes = { "EAN/UPC": "810144373539" };
    expect((buildInventoryItem(resolveListing(d, "ebay"), []).product as any).upc).toEqual(["810144373539"]);
    d.shared.attributes = { "EAN/UPC": "810144373353" };
    const p = buildInventoryItem(resolveListing(d, "ebay"), []).product as any;
    expect(p.upc).toBeUndefined();
    expect(p.ean).toBeUndefined();
  });
});
