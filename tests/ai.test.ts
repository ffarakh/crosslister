import { describe, expect, it } from "vitest";
import { applyAiResult, callVisionModel, type AiResult } from "@/lib/ai/generate";
import { emptyDraft } from "@/lib/listing/types";

const base: AiResult = {
  item_type: "over-ear headphones",
  title: "Black over-ear headphones with carry case",
  description: "Black over-ear headphones with a zipped carry case. Light scuffs on the headband.",
  brand: { value: "", basis: "unknown" },
  attributes: [
    { name: "Colour", value: "Black", basis: "clearly_visible" },
    { name: "Model", value: "WH-1000XM4", basis: "read_from_label" },
    { name: "Size", value: "Large", basis: "unknown" },
  ],
  visible_defects: ["Light scuffs on headband"],
  category_keywords: ["over-ear headphones"],
  uncertainties: ["Whether the cable is included"],
  questions: ["Do they power on and pair?"],
  price_estimate: { low_gbp: 60, high_gbp: 90, basis: "Typical used prices for similar items" },
};

describe("AI listing generation safeguards", () => {
  it("never fills brand unless read from a label or clearly printed", () => {
    const d = applyAiResult(emptyDraft(), { ...base, brand: { value: "Sony", basis: "unknown" } });
    expect(d.shared.brand).toBe("");
    const d2 = applyAiResult(emptyDraft(), { ...base, brand: { value: "Sony", basis: "read_from_label" } });
    expect(d2.shared.brand).toBe("Sony");
    expect(d2.ai.provenance.brand).toBe("ai_label");
  });

  it("drops unknown attributes and turns them into questions instead of guesses", () => {
    const d = applyAiResult(emptyDraft(), base);
    expect(d.shared.attributes).toEqual({ Colour: "Black", Model: "WH-1000XM4" });
    expect(d.ai.provenance["attr:Model"]).toBe("ai_label");
    expect(d.ai.provenance["attr:Colour"]).toBe("ai_visible");
    expect(d.ai.questions).toContain("What is the size?");
  });

  it("never sets condition, and never applies the price estimate automatically", () => {
    const d = applyAiResult(emptyDraft(), base);
    expect(d.shared.condition).toBe(emptyDraft().shared.condition);
    expect(d.shared.pricePence).toBeNull();
    expect(d.ai.priceEstimate).toEqual({ lowPence: 6000, highPence: 9000, basis: expect.any(String) });
  });

  it("never overwrites anything the seller typed or confirmed", () => {
    const d = emptyDraft();
    d.shared.title = "My own title";
    d.ai.provenance.title = "user";
    d.shared.attributes.Colour = "Navy";
    d.ai.provenance["attr:Colour"] = "confirmed";
    const out = applyAiResult(d, base);
    expect(out.shared.title).toBe("My own title");
    expect(out.shared.attributes.Colour).toBe("Navy");
  });

  it("re-running replaces its own earlier suggestions", () => {
    const once = applyAiResult(emptyDraft(), base);
    const twice = applyAiResult(once, { ...base, title: "Updated AI title" });
    expect(twice.shared.title).toBe("Updated AI title");
  });

  it("does not touch photos", () => {
    const d = emptyDraft();
    d.photos = [{ id: "p", path: "u/l/p.jpg" }];
    d.shared.photoIds = ["p"];
    const out = applyAiResult(d, base);
    expect(out.photos).toEqual(d.photos);
    expect(out.shared.photoIds).toEqual(["p"]);
  });

  it("sends images server-side with a forced structured tool call and validates the response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    let sent: any;
    const f: typeof fetch = async (_u, init) => {
      sent = JSON.parse(String(init!.body));
      expect((init!.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "submit_listing_draft", input: base }] }), { status: 200 });
    };
    const r = await callVisionModel([{ mediaType: "image/jpeg", base64: "AAAA" }], "Tested, fully working", f);
    expect(r.title).toBe(base.title);
    expect(sent.tool_choice).toEqual({ type: "tool", name: "submit_listing_draft" });
    expect(sent.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(sent.messages[0].content.at(-1).text).toContain("Tested, fully working");
  });

  it("rejects malformed model output rather than saving it", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const f: typeof fetch = async () =>
      new Response(JSON.stringify({ content: [{ type: "tool_use", input: { title: 5 } }] }), { status: 200 });
    await expect(callVisionModel([], "", f)).rejects.toThrow();
  });
});
