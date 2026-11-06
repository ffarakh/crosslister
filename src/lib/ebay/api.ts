import { EBAY_CURRENCY, EBAY_LOCALE, EBAY_MARKETPLACE, type EbayConfig } from "./config";
import { getAppToken } from "./oauth";

type Fetch = typeof fetch;

export interface EbayErrorItem {
  errorId?: number;
  message?: string;
  longMessage?: string;
  parameters?: { name: string; value: string }[];
}

export class EbayApiError extends Error {
  constructor(public status: number, public errors: EbayErrorItem[], public path: string) {
    super(errors.map((e) => e.longMessage || e.message).filter(Boolean).join("; ") || `eBay HTTP ${status}`);
  }
}
/** Request outcome unknown (timeout, network drop, eBay 5xx) — must reconcile before retrying. */
export class EbayTransportError extends Error {
  constructor(message: string, public path: string) {
    super(message);
  }
}

export class EbayApi {
  constructor(
    private cfg: EbayConfig,
    private accessToken: string,
    private f: Fetch = fetch,
    private timeoutMs = 30_000,
  ) {}

  async call<T>(method: string, path: string, body?: unknown, token = this.accessToken): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
      res = await this.f(`${this.cfg.apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Language": EBAY_LOCALE,
          "Accept-Language": EBAY_LOCALE,
          "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new EbayTransportError(`Network error calling eBay: ${(e as Error).message}`, path);
    }
    const text = await res.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (res.status >= 500) throw new EbayTransportError(`eBay server error ${res.status}`, path);
    if (!res.ok) {
      const errors = ((data as { errors?: EbayErrorItem[] })?.errors ?? []) as EbayErrorItem[];
      throw new EbayApiError(res.status, errors, path);
    }
    return { status: res.status, data: data as T };
  }

  // ---- Inventory ----
  putInventoryItem(sku: string, item: unknown) {
    return this.call("PUT", `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, item);
  }

  async getOffers(sku: string): Promise<EbayOffer[]> {
    try {
      const r = await this.call<{ offers?: EbayOffer[] }>(
        "GET",
        `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${EBAY_MARKETPLACE}`,
      );
      return r.data?.offers ?? [];
    } catch (e) {
      if (e instanceof EbayApiError && e.status === 404) return [];
      throw e;
    }
  }

  async createOffer(offer: unknown) {
    const r = await this.call<{ offerId: string }>("POST", `/sell/inventory/v1/offer`, offer);
    return r.data.offerId;
  }

  updateOffer(offerId: string, offer: unknown) {
    return this.call("PUT", `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, offer);
  }

  async publishOffer(offerId: string) {
    const r = await this.call<{ listingId: string; warnings?: EbayErrorItem[] }>(
      "POST",
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    );
    return r.data;
  }

  async listLocations() {
    const r = await this.call<{ locations?: { merchantLocationKey: string; name?: string; location?: unknown }[] }>(
      "GET",
      `/sell/inventory/v1/location?limit=100`,
    );
    return r.data?.locations ?? [];
  }

  createLocation(key: string, postalCode: string, name: string) {
    return this.call("POST", `/sell/inventory/v1/location/${encodeURIComponent(key)}`, {
      location: { address: { postalCode, country: "GB" } },
      locationTypes: ["WAREHOUSE"],
      merchantLocationStatus: "ENABLED",
      name,
    });
  }

  // ---- Account (business policies) ----
  async listPolicies() {
    const q = `?marketplace_id=${EBAY_MARKETPLACE}`;
    const [f, p, r] = await Promise.all([
      this.call<{ fulfillmentPolicies?: { fulfillmentPolicyId: string; name: string }[] }>("GET", `/sell/account/v1/fulfillment_policy${q}`),
      this.call<{ paymentPolicies?: { paymentPolicyId: string; name: string }[] }>("GET", `/sell/account/v1/payment_policy${q}`),
      this.call<{ returnPolicies?: { returnPolicyId: string; name: string }[] }>("GET", `/sell/account/v1/return_policy${q}`),
    ]);
    return {
      fulfillment: (f.data?.fulfillmentPolicies ?? []).map((x) => ({ id: x.fulfillmentPolicyId, name: x.name })),
      payment: (p.data?.paymentPolicies ?? []).map((x) => ({ id: x.paymentPolicyId, name: x.name })),
      return: (r.data?.returnPolicies ?? []).map((x) => ({ id: x.returnPolicyId, name: x.name })),
    };
  }

  optInToBusinessPolicies() {
    return this.call("POST", `/sell/account/v1/program/opt_in`, { programType: "SELLING_POLICY_MANAGEMENT" });
  }

  /** Create one basic postage, payment and returns policy so the seller can publish. Idempotent by name. */
  async createStarterPolicies(): Promise<{ fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string }> {
    const cat = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];
    const existing = await this.listPolicies();

    const fulfillmentPolicyId =
      existing.fulfillment.find((p) => p.name === "Standard postage")?.id ??
      (await this.createPolicy<{ fulfillmentPolicyId: string }>("fulfillment_policy", {
        name: "Standard postage",
        marketplaceId: EBAY_MARKETPLACE,
        categoryTypes: cat,
        handlingTime: { value: 1, unit: "DAY" },
        shippingOptions: [
          {
            optionType: "DOMESTIC",
            costType: "FLAT_RATE",
            shippingServices: [
              { sortOrder: 1, shippingServiceCode: "UK_RoyalMailSecondClassStandard", shippingCost: { value: "3.49", currency: EBAY_CURRENCY }, freeShipping: false },
            ],
          },
        ],
      })).fulfillmentPolicyId;

    const paymentPolicyId =
      existing.payment.find((p) => p.name === "Standard payment")?.id ??
      (await this.createPolicy<{ paymentPolicyId: string }>("payment_policy", {
        name: "Standard payment",
        marketplaceId: EBAY_MARKETPLACE,
        categoryTypes: cat,
      })).paymentPolicyId;

    const returnPolicyId =
      existing.return.find((p) => p.name === "30-day returns")?.id ??
      (await this.createPolicy<{ returnPolicyId: string }>("return_policy", {
        name: "No returns",
        marketplaceId: EBAY_MARKETPLACE,
        categoryTypes: cat,
        returnsAccepted: false,
      })).returnPolicyId;

    return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
  }

  private async createPolicy<T>(kind: "fulfillment_policy" | "payment_policy" | "return_policy", body: unknown): Promise<T> {
    const r = await this.call<T>("POST", `/sell/account/v1/${kind}`, body);
    return r.data;
  }

  // ---- Taxonomy (application token) ----
  private async appCall<T>(path: string) {
    const token = await getAppToken(this.cfg, this.f);
    return (await this.call<T>("GET", path, undefined, token)).data;
  }

  async categoryTreeId() {
    const d = await this.appCall<{ categoryTreeId: string }>(
      `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${EBAY_MARKETPLACE}`,
    );
    return d.categoryTreeId;
  }

  async suggestCategories(q: string) {
    const tree = await this.categoryTreeId();
    type S = {
      categorySuggestions?: {
        category: { categoryId: string; categoryName: string };
        categoryTreeNodeAncestors?: { categoryName: string }[];
      }[];
    };
    const d = await this.appCall<S>(
      `/commerce/taxonomy/v1/category_tree/${tree}/get_category_suggestions?q=${encodeURIComponent(q)}`,
    );
    return (d.categorySuggestions ?? []).map((s) => ({
      id: s.category.categoryId,
      name: s.category.categoryName,
      path: [...(s.categoryTreeNodeAncestors ?? []).map((a) => a.categoryName).reverse(), s.category.categoryName].join(" › "),
    }));
  }

  async requiredAspects(categoryId: string) {
    const tree = await this.categoryTreeId();
    type A = { aspects?: { localizedAspectName: string; aspectConstraint?: { aspectRequired?: boolean } }[] };
    const d = await this.appCall<A>(
      `/commerce/taxonomy/v1/category_tree/${tree}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
    );
    return (d.aspects ?? []).filter((a) => a.aspectConstraint?.aspectRequired).map((a) => a.localizedAspectName);
  }
}

export interface EbayOffer {
  offerId: string;
  sku: string;
  status?: "PUBLISHED" | "UNPUBLISHED";
  listing?: { listingId?: string; listingStatus?: string };
}
