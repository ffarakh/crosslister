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

  useEffect(() => {
    fetch("/api/listings")
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setRows(j.listings)));
  }, []);

  async function create() {
    const j = await (await fetch("/api/listings", { method: "POST" })).json();
    if (j.id) router.push(`/listings/${j.id}`);
    else setErr(j.error);
  }

  return (
    <main className="page">
      <div className="row between">
        <h1>Items</h1>
        <button className="primary" onClick={create}>+ New item</button>
      </div>
      {err && <p className="err">{err}</p>}
      {rows?.length === 0 && <p className="muted">No items yet. Create one and upload photos to start.</p>}
      <ul className="items">
        {rows?.map((r) => (
          <li key={r.id}>
            <Link href={`/listings/${r.id}`}>
              <strong>{r.data.shared?.title || "Untitled item"}</strong>
              <span className="muted">{formatPence(r.data.shared?.pricePence ?? null)}</span>
            </Link>
            <span className="chips">
              {r.platform_listings.map((p) => (
                <span key={p.platform} className={`chip s-${p.status}`}>
                  {PLATFORM_LABEL[p.platform]}: {p.status}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
