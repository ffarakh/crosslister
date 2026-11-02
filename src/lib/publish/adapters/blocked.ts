import type { PlatformAdapter } from "./types";

/**
 * Facebook Marketplace and Vinted: no approved listing API is available to this account,
 * and both platforms' terms prohibit automated posting tools. The listing is fully prepared
 * and validated, but publishing reports an accurate "blocked" result instead of pretending.
 * When approved API access exists, replace the adapter body — the orchestrator, editor,
 * validation and result reporting need no changes.
 */

export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",
  integrationStatus: () => "awaiting_approval",
  async publish() {
    return {
      status: "blocked",
      message:
        "Facebook Marketplace has no public listing API. Meta's Marketplace Partner Item/Seller APIs are restricted to approved classified-listing partners, and automated posting via scripts or extensions isn't permitted by Meta's terms.",
      resolution:
        "Requires acceptance into Meta's Marketplace Partner programme (business applicants only). Until then, list this item on Facebook yourself.",
    };
  },
  async reconcile() {
    return { status: "not_found" };
  },
};

export const vintedAdapter: PlatformAdapter = {
  platform: "vinted",
  integrationStatus: () => "awaiting_approval",
  async publish() {
    return {
      status: "blocked",
      message:
        "Vinted's only sanctioned integration is Vinted Pro Integrations (POST https://pro.svc.vinted.com/api/v1/items), available only to allowlisted Vinted Pro businesses. Vinted's terms ban unauthorised third-party listing tools and actively restrict accounts for them.",
      resolution:
        "Requires a Vinted Pro account (sole trader or company) AND allowlisting for Vinted Pro Integrations. Your account is a standard account, so neither is in place yet.",
    };
  },
  async reconcile() {
    return { status: "not_found" };
  },
};
