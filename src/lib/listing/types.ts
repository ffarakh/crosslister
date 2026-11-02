export const PLATFORMS = ["ebay", "facebook", "vinted"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  ebay: "eBay UK",
  facebook: "Facebook Marketplace",
  vinted: "Vinted UK",
};

export const CONDITIONS = [
  "new_sealed",
  "new_unsealed",
  "new_with_defects",
  "used_excellent",
  "used_very_good",
  "used_good",
  "used_acceptable",
  "for_parts",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABEL: Record<Condition, string> = {
  new_sealed: "New (sealed / with tags)",
  new_unsealed: "New (opened / no tags)",
  new_with_defects: "New with defects",
  used_excellent: "Used – excellent",
  used_very_good: "Used – very good",
  used_good: "Used – good",
  used_acceptable: "Used – acceptable",
  for_parts: "For parts / not working",
};

export interface Photo {
  id: string;
  path: string; // storage path in the private "photos" bucket
}

/** Where a value came from. "confirmed" only ever gets set by the user. */
export type Provenance = "user" | "confirmed" | "ai_label" | "ai_visible" | "ai_guess";

/** Fields every platform inherits from the shared listing unless overridden. */
export interface InheritableFields {
  title: string;
  description: string;
  pricePence: number | null;
  quantity: number;
  condition: Condition | null;
  brand: string;
  attributes: Record<string, string>;
  photoIds: string[]; // ordered; first = cover
}
export type InheritableKey = keyof InheritableFields;
export const INHERITABLE_KEYS: InheritableKey[] = [
  "title",
  "description",
  "pricePence",
  "quantity",
  "condition",
  "brand",
  "attributes",
  "photoIds",
];

export type DeliveryMode = "shipping" | "collection" | "both";

export interface EbayFields {
  categoryId: string;
  categoryName: string;
  requiredAspects: string[]; // names eBay marks aspectRequired for the chosen category
  fulfillmentPolicyId: string; // postage
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
}
export interface FacebookFields {
  category: string;
  delivery: DeliveryMode;
  collectionLocation: string;
}
export interface VintedFields {
  category: string;
  size: string;
  parcelSize: "" | "small" | "medium" | "large";
}
export interface PlatformSpecific {
  ebay: EbayFields;
  facebook: FacebookFields;
  vinted: VintedFields;
}

/** Overrides: a key present here means "explicitly set for this platform". Attributes override per key. */
export type Overrides = Partial<Omit<InheritableFields, "attributes">> & {
  attributes?: Record<string, string>;
};

export interface PlatformConfig<P extends Platform> {
  enabled: boolean;
  overrides: Overrides;
  fields: PlatformSpecific[P];
}

export interface AiState {
  itemType?: string;
  provenance: Partial<Record<string, Provenance>>; // keys: shared field names or "attr:<name>"
  questions: string[];
  uncertainties: string[];
  visibleDefects: string[];
  priceEstimate?: { lowPence: number; highPence: number; basis: string } | null;
  categoryKeywords?: string[];
  generatedAt?: string;
}

export interface ListingDraft {
  photos: Photo[];
  shared: InheritableFields;
  platforms: { [P in Platform]: PlatformConfig<P> };
  ai: AiState;
}

export type ResolvedListing<P extends Platform = Platform> = InheritableFields & {
  platform: P;
  fields: PlatformSpecific[P];
  photos: Photo[];
  overridden: InheritableKey[];
  overriddenAttributes: string[];
};

export function emptyDraft(): ListingDraft {
  return {
    photos: [],
    shared: {
      title: "",
      description: "",
      pricePence: null,
      quantity: 1,
      condition: "new_sealed", // most stock is brand new & sealed
      brand: "",
      attributes: {},
      photoIds: [],
    },
    platforms: {
      ebay: {
        enabled: true,
        overrides: {},
        fields: {
          categoryId: "",
          categoryName: "",
          requiredAspects: [],
          fulfillmentPolicyId: "",
          paymentPolicyId: "",
          returnPolicyId: "",
          merchantLocationKey: "",
        },
      },
      facebook: { enabled: false, overrides: {}, fields: { category: "", delivery: "collection", collectionLocation: "" } },
      vinted: { enabled: false, overrides: {}, fields: { category: "", size: "", parcelSize: "" } },
    },
    ai: { provenance: {}, questions: [], uncertainties: [], visibleDefects: [] },
  };
}
