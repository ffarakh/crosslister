"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPence } from "@/lib/listing/resolve";
import { PLATFORM_LABEL, type Platform } from "@/lib/listing/types";

type Row = {
  id: string;
  updated_at: string;
  data: { shared?: { title?: string; pricePence?: number | null } };
  platform_listings: { platform: Platform; status: string; external_url: string | null }[];
};

export default function Items() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [ebayConnected, setEbayConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/listings")
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setRows(j.listings)));
    fetch("/api/ebay/status")
      .then((r) => r.json())
      .then((s) => setEbayConnected(Boolean(s.connected)))
      .catch(() => setEbayConnected(null));
  }, []);

  async function create() {
    setCreating(true);
    const j = await (await fetch("/api/listings", { method: "POST" })).json();
    if (j.id) router.push(`/listings/${j.id}`);
    else {
      setErr(j.error);
      setCreating(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Your items</h1>
          <p className="sub">Create a listing once, publish it everywhere you're connected.</p>
        </div>
        <button className="primary big" onClick={create} disabled={creating}>{creating ? "Creating…" : "+ New item"}</button>
      </div>

      {err && <p className="err">{err}</p>}

      {ebayConnected === false && (
        <div className="banner">
          <div>
            <strong>Connect your eBay account to start publishing.</strong>
            <p className="small muted">You can build listings now, but you'll need eBay connected to publish them.</p>
          </div>
          <Link href="/connections" className="button primary">Connect eBay</Link>
        </div>
      )}

      {rows === null && (
        <div aria-hidden>
          <div className="skeleton sk-row" />
          <div className="skeleton sk-row" style={{ opacity: 0.7 }} />
          <div className="skeleton sk-row" style={{ opacity: 0.4 }} />
        </div>
      )}

      {rows?.length === 0 && (
        <div className="empty">
          <span className="ico">📦</span>
          <h3>No items yet</h3>
          <p>Add your first item, upload its photos, and Crosslister will help you list it across your marketplaces.</p>
          <button className="primary big" onClick={create} disabled={creating}>{creating ? "Creating…" : "+ Create your first item"}</button>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="items">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/listings/${r.id}`}>
                <strong>{r.data.shared?.title || "Untitled item"}</strong>
                <span className="muted">{formatPence(r.data.shared?.pricePence ?? null)}</span>
              </Link>
              <span className="chips">
                {r.platform_listings.length === 0 && <span className="chip s-idle">draft</span>}
                {r.platform_listings.map((p) => (
                  <span key={p.platform} className={`chip s-${p.status}`}>
                    {PLATFORM_LABEL[p.platform]}: {p.status}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
