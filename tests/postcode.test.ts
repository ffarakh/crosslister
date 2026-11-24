import { describe, expect, it } from "vitest";
import { normaliseUkPostcode } from "@/lib/postcode";

describe("UK postcode normalisation", () => {
  it("adds the space and uppercases", () => {
    expect(normaliseUkPostcode("dy90xa")).toBe("DY9 0XA");
    expect(normaliseUkPostcode(" DY8 1RD ")).toBe("DY8 1RD");
    expect(normaliseUkPostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(normaliseUkPostcode("B11AA")).toBe("B1 1AA");
  });
  it("rejects partial or invalid postcodes", () => {
    expect(normaliseUkPostcode("DY8")).toBeNull();
    expect(normaliseUkPostcode("hello")).toBeNull();
  });
});
