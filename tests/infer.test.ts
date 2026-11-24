import { describe, expect, it } from "vitest";
import { inferAspect } from "@/lib/listing/aspects";

describe("inferAspect (Department from category path)", () => {
  const path = "Clothes, Shoes & Accessories › Men › Men's Accessories › Wallets";
  it("infers Men from a men's category", () => {
    expect(inferAspect("Department", path, ["Men", "Women", "Unisex Adults"])).toBe("Men");
  });
  it("prefers Women over Men (substring trap)", () => {
    expect(inferAspect("Department", "Clothes › Women › Women's Bags", ["Men", "Women"])).toBe("Women");
  });
  it("returns nothing when the value isn't allowed or not a Department", () => {
    expect(inferAspect("Department", path, ["Unisex Adults"])).toBe("");
    expect(inferAspect("Type", path, ["Wallet"])).toBe("");
  });
});
