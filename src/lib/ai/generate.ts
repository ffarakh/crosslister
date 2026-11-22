import { z } from "zod";
import type { ListingDraft, Provenance } from "@/lib/listing/types";

/**
 * Vision listing draft via the Anthropic Messages API (server-side only; key never reaches the browser).
 * The model is forced to answer through a tool schema that separates what it READ on a label,
 * what it can SEE, and what it doesn't know. Anything it doesn't know becomes a question, never a value.
 */

const Basis = z.enum(["read_from_label", "clearly_visible", "unknown"]);

export const AiResult = z.object({
  item_type: z.string(),
  title: z.string(),
  description: z.string(),
  brand: z.object({ value: z.string(), basis: Basis }),
  attributes: z.array(z.object({ name: z.string(), value: z.string(), basis: Basis })),
  visible_defects: z.array(z.string()),
  category_keywords: z.array(z.string()),
  uncertainties: z.array(z.string()),
  questions: z.array(z.string()),
  price_estimate: z
    .object({ low_gbp: z.number(), high_gbp: z.number(), basis: z.string() })
    .nullable()
    .optional(),
  rrp: z.object({ price_gbp: z.number(), source: z.string(), url: z.string() }).nullable().optional(),
  market_offers: z
    .array(z.object({ retailer: z.string(), price_gbp: z.number(), url: z.string() }))
    .optional()
    .default([]),
});
export type AiResult = z.infer<typeof AiResult>;

const TOOL = {
  name: "submit_listing_draft",
  description: "Submit a factual second-hand listing draft based only on the photos.",
  input_schema: {
    type: "object",
    required: ["item_type", "title", "description", "brand", "attributes", "visible_defects", "category_keywords", "uncertainties", "questions"],
    properties: {
      item_type: { type: "string", description: "Plain item type, e.g. 'wireless over-ear headphones'" },
      title: { type: "string", description: "Factual title, UK English, max 80 characters. Only include brand/model/size if read from a label." },
      description: {
        type: "string",
        description:
          "Factual UK-English description of what is visible: item, colour, included parts, visible condition and any visible marks/damage. No hype, no claims about authenticity, working order, materials or measurements unless read from a label. Use plain paragraphs.",
      },
      brand: {
        type: "object",
        required: ["value", "basis"],
        properties: {
          value: { type: "string", description: "Empty string if not read from a label or clearly printed logo" },
          basis: { type: "string", enum: ["read_from_label", "clearly_visible", "unknown"] },
        },
      },
      attributes: {
        type: "array",
        description: "Item specifics (e.g. Colour, Model, Size, Material). Only include values you READ or can clearly SEE (colour). Never guess.",
        items: {
          type: "object",
          required: ["name", "value", "basis"],
          properties: {
            name: { type: "string" },
            value: { type: "string" },
            basis: { type: "string", enum: ["read_from_label", "clearly_visible", "unknown"] },
          },
        },
      },
      visible_defects: { type: "array", items: { type: "string" } },
      category_keywords: { type: "array", items: { type: "string" }, description: "2-4 search phrases for marketplace category lookup" },
      uncertainties: { type: "array", items: { type: "string" }, description: "Things that could be wrong in this draft" },
      questions: {
        type: "array",
        items: { type: "string" },
        description: "Only questions whose answers matter to a buyer and can't be seen: e.g. working condition, size if no label, model number, missing accessories. Max 5.",
      },
      price_estimate: {
        type: ["object", "null"],
        description: "Your suggested UK selling price range for this item as NEW, informed by your searches. Null only if you truly found nothing.",
        properties: { low_gbp: { type: "number" }, high_gbp: { type: "number" }, basis: { type: "string", description: "One line citing the sources behind the range" } },
      },
      rrp: {
        type: ["object", "null"],
        description: "The item's recommended retail price (RRP) / typical full price new, from a manufacturer or major retailer. Null if not found.",
        properties: { price_gbp: { type: "number" }, source: { type: "string", description: "Retailer/brand name" }, url: { type: "string" } },
      },
      market_offers: {
        type: "array",
        description: "Current prices to buy this item BRAND NEW from UK websites, cheapest first (up to 5). Each from a real search result. Empty if none found.",
        items: {
          type: "object",
          required: ["retailer", "price_gbp", "url"],
          properties: { retailer: { type: "string" }, price_gbp: { type: "number" }, url: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM = `You prepare honest second-hand marketplace listings for a UK seller from their own photos.
Rules:
- Never invent brand, model, authenticity, size, material, working condition or measurements. Only state them if legible on a label/tag/packaging in the photos.
- Describe visible wear and damage plainly. Do not minimise it.
- Do not say an item works, is genuine, or is complete unless a label proves it — ask instead.
- UK English spelling. Factual, concise, no emojis, no hype words.
- If unsure, leave the field empty and add a question or uncertainty.
- Assume the item is BRAND NEW and SEALED unless the photos clearly show otherwise; write the title and description on that basis. If the photos clearly show it opened, used or damaged, say so instead and add an uncertainty.
- The seller offers NO WARRANTY and NO RETURNS. Never state or imply a warranty, guarantee or returns. You may add a brief "No warranty, sold as new and sealed." line to the description.
- If a barcode (EAN/UPC) or model number is legible, include it as an attribute so the exact product can be identified.
- PRICE: use web search to identify the exact product and find its current UK price as a NEW item — its RRP and what it currently sells for new on eBay UK and major UK retailers. Base price_estimate on those figures and name the sources (shops/sites) in the basis field. If you genuinely cannot find it, set price_estimate to null and say so in an uncertainty. Never guess a price without searching.`;

export interface ImageInput {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
}

type Block = { type: string; name?: string; input?: unknown };
type ApiResponse = { content?: Block[]; stop_reason?: string; error?: { message: string } };

export async function callVisionModel(images: ImageInput[], sellerNotes: string, f: typeof fetch = fetch): Promise<AiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const messages: { role: string; content: unknown }[] = [
    {
      role: "user",
      content: [
        ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.base64 } })),
        {
          type: "text",
          text: `Draft a listing from these ${images.length} photo(s) of one item. Search the web to identify the exact product and its current UK price as new, then reply by calling the ${TOOL.name} tool with your draft — the tool call must be your final step.${sellerNotes ? `\nFacts the seller has confirmed:\n${sellerNotes}` : ""}`,
        },
      ],
    },
  ];

  // The model may run several web searches (handled server-side) before calling our tool.
  // Loop to continue through any pause_turn pauses until it emits the submit_listing_draft call.
  for (let step = 0; step < 5; step++) {
    const res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 3000,
        system: SYSTEM,
        tools: [TOOL, { type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "GB" } }],
        tool_choice: { type: "auto" },
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(`AI request failed: ${json.error?.message ?? res.status}`);

    const draft = json.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
    if (draft) return AiResult.parse(draft.input);

    if (json.stop_reason === "pause_turn" && json.content) {
      messages.push({ role: "assistant", content: json.content });
      continue; // resume the paused search turn
    }
    break; // ended without calling the tool
  }
  throw new Error("The AI didn't return a structured draft. Please try again.");
}

const provOf = (b: z.infer<typeof Basis>): Provenance | null =>
  b === "read_from_label" ? "ai_label" : b === "clearly_visible" ? "ai_visible" : null;

/** A field the AI may fill: empty, or previously AI-filled (never overwrite the seller's own edits). */
function aiMayWrite(draft: ListingDraft, key: string, current: unknown) {
  const p = draft.ai.provenance[key];
  const empty = current == null || current === "";
  return empty || (p !== undefined && p !== "user" && p !== "confirmed");
}

export function applyAiResult(draft: ListingDraft, r: AiResult): ListingDraft {
  const next = structuredClone(draft);
  const prov = next.ai.provenance;

  if (aiMayWrite(next, "title", next.shared.title)) {
    next.shared.title = r.title.slice(0, 80);
    prov.title = "ai_visible";
  }
  if (aiMayWrite(next, "description", next.shared.description)) {
    next.shared.description = r.description;
    prov.description = "ai_visible";
  }
  const bp = provOf(r.brand.basis);
  if (bp && r.brand.value.trim() && aiMayWrite(next, "brand", next.shared.brand)) {
    next.shared.brand = r.brand.value.trim();
    prov.brand = bp;
  }
  const questions = [...r.questions];
  for (const a of r.attributes) {
    const key = `attr:${a.name}`;
    const p = provOf(a.basis);
    if (!p || !a.value.trim()) {
      questions.push(`What is the ${a.name.toLowerCase()}?`);
      continue;
    }
    if (aiMayWrite(next, key, next.shared.attributes[a.name])) {
      next.shared.attributes[a.name] = a.value.trim();
      prov[key] = p;
    }
  }
  next.ai = {
    ...next.ai,
    provenance: prov,
    itemType: r.item_type,
    questions: [...new Set(questions)].slice(0, 6),
    uncertainties: r.uncertainties,
    visibleDefects: r.visible_defects,
    categoryKeywords: r.category_keywords,
    priceEstimate:
      r.price_estimate && r.price_estimate.high_gbp > 0
        ? {
            lowPence: Math.round(r.price_estimate.low_gbp * 100),
            highPence: Math.round(r.price_estimate.high_gbp * 100),
            basis: r.price_estimate.basis,
          }
        : null,
    rrp:
      r.rrp && r.rrp.price_gbp > 0
        ? { pricePence: Math.round(r.rrp.price_gbp * 100), source: r.rrp.source, url: r.rrp.url }
        : null,
    marketOffers: (r.market_offers ?? [])
      .filter((o) => o.price_gbp > 0)
      .map((o) => ({ retailer: o.retailer, pricePence: Math.round(o.price_gbp * 100), url: o.url }))
      .sort((a, b) => a.pricePence - b.pricePence)
      .slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
  return next;
}
