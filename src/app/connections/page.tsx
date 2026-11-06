"use client";
import { useEffect, useState } from "react";

type Opt = { id: string; name: string };
type Status = {
  configured: boolean;
  message?: string;
  env?: string;
  connected?: boolean;
  defaults?: Record<string, string>;
  policies?: { fulfillment: Opt[]; payment: Opt[]; return: Opt[] } | null;
  policyError?: string | null;
  locations?: { key: string; name: string }[];
};

function noPolicies(s: Status): boolean {
  const p = s.policies;
  return !!p && (p.fulfillment.length + p.payment.length + p.return.length) === 0;
}

export default function Connections() {
  const [s, setS] = useState<Status | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [postcode, setPostcode] = useState("");
  const [msg, setMsg] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const load = () =>
    fetch("/api/ebay/status")
      .then((r) => r.json())
      .then((j: Status) => {
        setS(j);
        setDefaults(j.defaults ?? {});
      });
  useEffect(() => {
    setFlash(new URLSearchParams(window.location.search).get("ebay"));
    load();
  }, []);

  async function post(url: string, body?: unknown, method = "POST") {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    setMsg(j.error ?? j.note ?? "Saved");
    load();
  }

  const sel = (key: string, label: string, opts: Opt[]) => (
    <label>
      {label}
      <select value={defaults[key] ?? ""} onChange={(e) => setDefaults({ ...defaults, [key]: e.target.value })}>
        <option value="">— choose —</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="page narrowish">
      <h1>Connections</h1>
      {flash && <p className={flash === "connected" ? "ok" : "err"}>eBay: {flash}</p>}
      {msg && <p className="muted">{msg}</p>}

      <section className="card">
        <div className="row between">
          <h2>eBay UK</h2>
          <span className={`chip ${s?.connected ? "s-published" : "s-idle"}`}>
            {!s ? "…" : !s.configured ? "awaiting credentials" : s.connected ? `connected · ${s.env}` : `not connected · ${s.env}`}
          </span>
        </div>
        {s && !s.configured && <p className="err">{s.message}. Add them to your environment (see README).</p>}
        {s?.configured && !s.connected && (
          <a className="button primary" href="/api/ebay/connect">Connect eBay account</a>
        )}
        {s?.connected && (
          <div className="stack">
            {s.policyError ? (
              <div className="warnbox">
                <p>eBay couldn't return your business policies: {s.policyError}</p>
                <p>If you haven't opted in to business policies yet, do that first.</p>
                <button onClick={() => post("/api/ebay/optin")}>Opt in to business policies</button>
              </div>
            ) : (
              <>
                <p className="muted">Defaults applied to new items (changeable per item).</p>
                {noPolicies(s) && (
                  <div className="warnbox">
                    <p>You have no business policies yet. Create a basic set (standard postage, payment, 30-day returns) in one click — you can fine-tune them in eBay later.</p>
                    <button className="primary" onClick={() => post("/api/ebay/starter-policies")}>Create starter policies</button>
                  </div>
                )}
                {sel("fulfillmentPolicyId", "Postage policy", s.policies?.fulfillment ?? [])}
                {sel("paymentPolicyId", "Payment policy", s.policies?.payment ?? [])}
                {sel("returnPolicyId", "Returns policy", s.policies?.return ?? [])}
              </>
            )}
            <label>
              Item location
              <select value={defaults.merchantLocationKey ?? ""} onChange={(e) => setDefaults({ ...defaults, merchantLocationKey: e.target.value })}>
                <option value="">— choose —</option>
                {(s.locations ?? []).map((l) => (
                  <option key={l.key} value={l.key}>{l.name}</option>
                ))}
              </select>
            </label>
            <div className="row">
              <input placeholder="Postcode for a new location" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
              <button disabled={!postcode} onClick={() => post("/api/ebay/location", { postalCode: postcode, name: `Home ${postcode.toUpperCase()}` })}>
                Create location
              </button>
            </div>
            <div className="row">
              <button className="primary" onClick={() => post("/api/ebay/defaults", defaults, "PUT")}>Save defaults</button>
              <button className="ghost" onClick={() => post("/api/ebay/disconnect")}>Disconnect</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h2>Facebook Marketplace</h2>
          <span className="chip s-blocked">awaiting approval</span>
        </div>
        <p>No public listing API exists. Meta's Marketplace Partner APIs are only for approved classified-listing businesses, and Meta's terms don't permit automated posting from scripts or extensions.</p>
        <p className="muted">Your items are still fully prepared and validated for Facebook. Publishing reports this blocker instead of posting.</p>
      </section>

      <section className="card">
        <div className="row between">
          <h2>Vinted UK</h2>
          <span className="chip s-blocked">awaiting approval</span>
        </div>
        <p>The only approved route is Vinted Pro Integrations, for allowlisted Vinted Pro businesses. Vinted's terms ban third-party listing tools and they actively restrict accounts for them.</p>
        <p className="muted">To unblock: convert to (or open) a Vinted Pro account as a sole trader, then request Vinted Pro Integrations access.</p>
      </section>
    </main>
  );
}
