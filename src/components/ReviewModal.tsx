"use client";
import { useEffect, useState } from "react";
import { formatPence } from "@/lib/listing/resolve";
import { CONDITION_LABEL, PLATFORM_LABEL, type Platform, type ResolvedListing } from "@/lib/listing/types";
import type { Issue } from "@/lib/listing/validate";
import type { PlatformResult } from "@/lib/publish/orchestrator";

export type PlatformRow = {
  platform: Platform;
  status: string;
  external_id: string | null;
  external_url: string | null;
  last_error: { message?: string } | null;
};

type ReviewItem = {
  platform: Platform;
  resolved: ResolvedListing;
  photoUrls: (string | null)[];
  hash: string;
  issues: Issue[];
  integration: { status: string; note: string };
};

function deliverySummary(r: ResolvedListing): string {
  if (r.platform === "ebay") {
    const f = r.fields as ResolvedListing<"ebay">["fields"];
    return f.fulfillmentPolicyId ? "Per your eBay postage policy" : "No postage policy chosen";
  }
  if (r.platform === "facebook") {
    const f = r.fields as ResolvedListing<"facebook">["fields"];
    return f.delivery === "shipping" ? "Postage only" : `${f.delivery === "both" ? "Collection or postage" : "Collection only"}${f.collectionLocation ? ` · ${f.collectionLocation}` : ""}`;
  }
  const f = r.fields as ResolvedListing<"vinted">["fields"];
  return f.parcelSize ? `Vinted postage · ${f.parcelSize} parcel` : "No parcel size";
}

export function ReviewModal({ listingId, onClose, onPublished }: { listingId: string; onClose: () => void; onPublished: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [err, setErr] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PlatformResult[] | null>(null);

  useEffect(() => {
    fetch(`/api/listings/${listingId}/review`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setItems(j.platforms)));
  }, [listingId]);

  const ready = items?.filter((i) => !i.issues.some((x) => x.severity === "error")) ?? [];
  const notReady = items?.filter((i) => i.issues.some((x) => x.severity === "error")) ?? [];

  async function publish() {
    setPublishing(true);
    setErr("");
    const reviewed = Object.fromEntries(ready.map((i) => [i.platform, i.hash]));
    const r = await fetch(`/api/listings/${listingId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true, reviewed }),
    });
    const j = await r.json();
    setPublishing(false);
    if (!r.ok) return setErr(j.error);
    setResults(j.results);
    onPublished();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{results ? "Results" : "Review before publishing"}</h2>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        {err && <p className="err">{err}</p>}
        {!items && !err && <p className="muted">Preparing final versions…</p>}

        {results ? (
          <div className="stack">
            {results.map((r) => <ResultCard key={r.platform} r={r} />)}
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          items && (
            <>
              <div className="review-grid">
                {items.map((i) => (
                  <article key={i.platform} className="review-card">
                    <header className="row between">
                      <strong>{PLATFORM_LABEL[i.platform]}</strong>
                      <span className={`chip ${i.integration.status === "implemented" ? "s-published" : "s-blocked"}`}>{i.integration.status.replace("_", " ")}</span>
                    </header>
                    <div className="thumbs">
                      {i.photoUrls.map((u, n) => (u ? <img key={n} src={u} alt="" className={n === 0 ? "cover" : ""} /> : null))}
                    </div>
                    <h4>{i.resolved.title || <em className="muted">No title</em>}</h4>
                    <p className="price">
                      {formatPence(i.resolved.pricePence)} · qty {i.resolved.quantity} · {i.resolved.condition ? CONDITION_LABEL[i.resolved.condition] : "no condition"}
                      {i.resolved.overridden.includes("pricePence") && <span className="chip small">platform price</span>}
                    </p>
                    <p className="small"><strong>Delivery:</strong> {deliverySummary(i.resolved)}</p>
                    {i.resolved.brand && <p className="small"><strong>Brand:</strong> {i.resolved.brand}</p>}
                    {Object.keys(i.resolved.attributes).length > 0 && (
                      <p className="small">{Object.entries(i.resolved.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                    )}
                    <details>
                      <summary>Description{i.resolved.overridden.includes("description") ? " (platform-specific)" : ""}</summary>
                      <pre className="desc">{i.resolved.description}</pre>
                    </details>
                    {i.issues.length > 0 && (
                      <ul className="issues">{i.issues.map((x, n) => <li key={n} className={x.severity}>{x.message}</li>)}</ul>
                    )}
                    {i.integration.status !== "implemented" && <p className="small muted">{i.integration.note}</p>}
                  </article>
                ))}
              </div>
              {notReady.length > 0 && (
                <p className="warnbox">Not included until fixed: {notReady.map((i) => PLATFORM_LABEL[i.platform]).join(", ")}</p>
              )}
              <div className="row between">
                <button className="ghost" onClick={onClose}>Back to editing</button>
                <button className="primary big" disabled={!ready.length || publishing} onClick={publish}>
                  {publishing ? "Publishing…" : `Publish to selected platforms (${ready.length})`}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: PlatformResult }) {
  const label = PLATFORM_LABEL[r.platform];
  switch (r.status) {
    case "published":
      return (
        <div className="result s-published">
          <strong>{label}: live</strong> · <a href={r.url} target="_blank" rel="noreferrer">View listing #{r.externalId}</a>
          {r.warnings?.map((w) => <div key={w} className="small">{w}</div>)}
        </div>
      );
    case "already_published":
      return (
        <div className="result s-published">
          <strong>{label}: already live</strong> — not submitted again.{" "}
          {r.url && <a href={r.url} target="_blank" rel="noreferrer">View listing</a>}
        </div>
      );
    case "blocked":
      return (
        <div className="result s-blocked">
          <strong>{label}: not published (blocked)</strong>
          <div className="small">{r.message}</div>
          <div className="small"><strong>What would unblock it:</strong> {r.resolution}</div>
        </div>
      );
    case "uncertain":
      return <div className="result s-uncertain"><strong>{label}: result unknown</strong><div className="small">{r.message}</div></div>;
    case "in_progress":
      return <div className="result s-submitting"><strong>{label}: already in progress</strong><div className="small">{r.message}</div></div>;
    case "invalid":
      return <div className="result s-failed"><strong>{label}: not submitted</strong><div className="small">{r.issues.map((i) => i.message).join("; ")}</div></div>;
    case "failed":
      return <div className="result s-failed"><strong>{label}: failed</strong><div className="small">{r.message}</div></div>;
  }
}
