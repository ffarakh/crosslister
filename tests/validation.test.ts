import { describe, expect, it } from "vitest";
import { setOverride, setShared } from "@/lib/listing/resolve";
import { emptyDraft } from "@/lib/listing/types";
import { validatePlatform, validateSelected } from "@/lib/listing/validate";
import { readyDraft } from "./fixtures";

const errors = (d: ReturnType<typeof readyDraft>, p: "ebay" | "facebook" | "vinted") =>
  validatePlatform(d, p).filter((i) => i.severity === "error").map((i) => i.field);

describe("required-field validation", () => {
  it("a complete draft has no blocking issues", () => {
    expect(validateSelected(readyDraft()).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("an empty draft reports every missing core field", () => {
    const e = emptyDraft();
    e.shared.condition = null;
    const f = errors(e, "ebay");
    for (const k of ["photoIds", "title", "description", "pricePence", "condition", "categoryId", "fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId", "merchantLocationKey"])
      expect(f).toContain(k);
  });

  it("validates the resolved platform value, not the shared one", () => {
    const d = setOverride(readyDraft(), "vinted", "pricePence", 0);
    expect(errors(d, "vinted")).toContain("pricePence");
    expect(errors(d, "ebay")).not.toContain("pricePence");
  });

  it("eBay title limit is 80 characters", () => {
    const d = setShared(readyDraft(), "title", "x".repeat(81));
    expect(errors(d, "ebay")).toContain("title");
    expect(errors(d, "facebook")).not.toContain("title");
    expect(errors(setOverride(d, "ebay", "title", "short"), "ebay")).not.toContain("title");
  });

  it("eBay required item specifics for the category must be present (Brand satisfied by brand field)", () => {
    const d = readyDraft();
    d.platforms.ebay.fields.requiredAspects = ["Brand", "Type"];
    expect(errors(d, "ebay")).toEqual(expect.arrayContaining(["attr:Brand", "attr:Type"]));
    const fixed = setShared(setShared(d, "brand", "Acme"), "attributes", { Colour: "Black", Type: "Over-ear" });
    expect(errors(fixed, "ebay")).toEqual([]);
  });

  it("Facebook collection needs a collection location; postage-only doesn't", () => {
    const d = readyDraft();
    d.platforms.facebook.fields.collectionLocation = "";
    expect(errors(d, "facebook")).toContain("collectionLocation");
    d.platforms.facebook.fields.delivery = "shipping";
    expect(errors(d, "facebook")).not.toContain("collectionLocation");
  });

  it("Vinted needs a parcel size", () => {
    const d = readyDraft();
    d.platforms.vinted.fields.parcelSize = "";
    expect(errors(d, "vinted")).toContain("parcelSize");
  });

  it("AI-guessed brand/attributes block publishing until confirmed; label-read values only warn", () => {
    const d = setShared(readyDraft(), "brand", "Sony");
    d.ai.provenance.brand = "ai_guess";
    d.ai.provenance["attr:Colour"] = "ai_visible";
    expect(errors(d, "ebay")).toContain("brand");
    expect(validatePlatform(d, "ebay").find((i) => i.field === "attr:Colour")?.severity).toBe("warning");
    d.ai.provenance.brand = "confirmed";
    expect(errors(d, "ebay")).not.toContain("brand");
  });

  it("only selected platforms are validated", () => {
    const d = emptyDraft();
    d.platforms.ebay.enabled = false;
    expect(validateSelected(d)).toEqual([]);
  });
});
