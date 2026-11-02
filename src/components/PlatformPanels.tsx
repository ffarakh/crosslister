"use client";
import { useEffect, useState } from "react";
import type { DeliveryMode, ListingDraft, Platform, PlatformSpecific } from "@/lib/listing/types";
import type { Issue } from "@/lib/listing/validate";
import { FieldShell } from "./Fields";

type Update = (fn: (d: ListingDraft) => ListingDraft) => void;
type Props = { draft: ListingDraft; update: Update; issues: Issue[] };

function setFields<P extends Platform>(update: Update, p: P, patch: Partial<PlatformSpecific[P]>) {
  update((d) => ({ ...d, platforms: { ...d.platforms, [p]: { ...d.platforms[p], fields: { ...d.platforms[p].fields, ...patch } } } }));
}
const errOf = (issues: Issue[], f: string) => issues.find((i) => i.field === f && i.severity === "error")?.message;
const warnOf = (issues: Issue[], f: string) => issues.find((i) => i.field === f && i.severity === "warning")?.message;

type Opt = { id: string; name: string };
type EbayStatus = {
  connected?: boolean;
  configured?: boolean;
  message?: string;
  policies?: { fulfillment: Opt[]; payment: Opt[]; return: Opt[] } | null;
  locations?: { key: string; name: string }[];
};

export function EbayFieldsPanel({ draft, update, issues }: Props) {
  const f = draft.platforms.ebay.fields;
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [q, setQ] = useState(draft.ai.categoryKeywords?.[0] ?? draft.shared.title);
  const [cats, setCats] = useState<{ id: string; name: string; path: string }[]>([]);
  const [catErr, setCatErr] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/ebay/status").then((r) => r.json()).then(setStatus);
  }, []);

  async function search() {
    setSearching(true);
    setCatErr("");
    const j = await (await fetch(`/api/ebay/categories?q=${encodeURIComponent(q)}`)).json();
    setSearching(false);
    if (j.error) setCatErr(j.error);
    else setCats(j.categories);
  }

  async function choose(c: { id: string; name: string; path: string }) {
    setCats([]);
    setFields(update, "ebay", { categoryId: c.id, categoryName: c.path, requiredAspects: [] });
    const j = await (await fetch(`/api/ebay/aspects?categoryId=${c.id}`)).json();
    if (!j.error) setFields(update, "ebay", { requiredAspects: j.required });
  }

  const policySel = (key: "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId", label: string, opts: Opt[]) => (
    <FieldShell label={label} error={errOf(issues, key)}>
      <select value={f[key]} onChange={(e) => setFields(update, "ebay", { [key]: e.target.value })}>
        <option value="">— choose —</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </FieldShell>
  );

  return (
    <div className="stack">
      {status && !status.connected && (
        <p className="warnbox">{status.configured === false ? status.message : "eBay isn't connected yet."} <a href="/connections">Go to Connections</a></p>
      )}
      <FieldShell label="Category" error={errOf(issues, "categoryId")} hint={f.categoryName || undefined}>
        <div className="row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search eBay categories" onKeyDown={(e) => e.key === "Enter" && search()} />
          <button onClick={search} disabled={!q.trim() || searching}>{searching ? "…" : "Suggest"}</button>
        </div>
        {catErr && <p className="err small">{catErr}</p>}
        {cats.length > 0 && (
          <ul className="picker">
            {cats.map((c) => <li key={c.id}><button className="link" onClick={() => choose(c)}>{c.path}</button></li>)}
          </ul>
        )}
      </FieldShell>
      {f.requiredAspects.length > 0 && (
        <p className="muted small">eBay requires for this category: {f.requiredAspects.join(", ")}. Add them under item attributes below.</p>
      )}
      <div className="grid3">
        {policySel("fulfillmentPolicyId", "Postage policy", status?.policies?.fulfillment ?? [])}
        {policySel("paymentPolicyId", "Payment policy", status?.policies?.payment ?? [])}
        {policySel("returnPolicyId", "Returns policy", status?.policies?.return ?? [])}
      </div>
      <FieldShell label="Item location" error={errOf(issues, "merchantLocationKey")}>
        <select value={f.merchantLocationKey} onChange={(e) => setFields(update, "ebay", { merchantLocationKey: e.target.value })}>
          <option value="">— choose —</option>
          {(status?.locations ?? []).map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
      </FieldShell>
      <p className="muted small">Postage options, costs and collection-in-person for eBay come from the postage policy you choose (set up in eBay Seller Hub).</p>
    </div>
  );
}

export function FacebookFieldsPanel({ draft, update, issues }: Props) {
  const f = draft.platforms.facebook.fields;
  return (
    <div className="stack">
      <FieldShell label="Category" error={errOf(issues, "category")}>
        <input value={f.category} onChange={(e) => setFields(update, "facebook", { category: e.target.value })} placeholder="e.g. Electronics › Headphones" />
      </FieldShell>
      <FieldShell label="Delivery">
        <div className="row wrap">
          {(["collection", "shipping", "both"] as DeliveryMode[]).map((m) => (
            <label key={m} className="check">
              <input type="radio" name="fb-delivery" checked={f.delivery === m} onChange={() => setFields(update, "facebook", { delivery: m })} />
              {m === "collection" ? "Collection only" : m === "shipping" ? "Postage only" : "Collection or postage"}
            </label>
          ))}
        </div>
      </FieldShell>
      {f.delivery !== "shipping" && (
        <FieldShell label="Collection location" error={errOf(issues, "collectionLocation")} hint="Town or area shown to buyers, e.g. 'Stourbridge'">
          <input value={f.collectionLocation} onChange={(e) => setFields(update, "facebook", { collectionLocation: e.target.value })} />
        </FieldShell>
      )}
    </div>
  );
}

export function VintedFieldsPanel({ draft, update, issues }: Props) {
  const f = draft.platforms.vinted.fields;
  return (
    <div className="stack">
      <FieldShell label="Category" error={errOf(issues, "category")}>
        <input value={f.category} onChange={(e) => setFields(update, "vinted", { category: e.target.value })} placeholder="e.g. Men › Clothing › Jumpers" />
      </FieldShell>
      <div className="grid3">
        <FieldShell label="Size" error={errOf(issues, "size")} hint={warnOf(issues, "size")}>
          <input value={f.size} onChange={(e) => setFields(update, "vinted", { size: e.target.value })} />
        </FieldShell>
        <FieldShell label="Parcel size" error={errOf(issues, "parcelSize")}>
          <select value={f.parcelSize} onChange={(e) => setFields(update, "vinted", { parcelSize: e.target.value as typeof f.parcelSize })}>
            <option value="">— choose —</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </FieldShell>
      </div>
    </div>
  );
}
