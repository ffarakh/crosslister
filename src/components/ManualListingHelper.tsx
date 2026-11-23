"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatPence, resolveListing } from "@/lib/listing/resolve";
import { CONDITION_LABEL, type ListingDraft, type Platform, type ResolvedListing } from "@/lib/listing/types";

/** Build ready-to-paste text tailored to each marketplace (no AI cost — assembled from the draft). */
function facebookText(r: ResolvedListing<"facebook">): string {
  const f = r.fields;
  const lines = [r.title.trim(), "", r.description.trim(), ""];
  if (f.delivery === "collection") lines.push(`📍 Collection only${f.collectionLocation ? ` — ${f.collectionLocation}` : ""}`);
  else if (f.delivery === "both") lines.push(`📍 Collection${f.collectionLocation ? ` from ${f.collectionLocation}` : ""} or postage`);
  else lines.push("📦 Postage available");
  lines.push("💷 Cash on collection preferred — bank transfer also fine");
  lines.push("✅ Brand new & sealed. No returns, sold as seen.");
  if (r.pricePence) lines.push(`Price: ${formatPence(r.pricePence)}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function vintedText(r: ResolvedListing<"vinted">): string {
  const parts = [r.title.trim(), "", r.description.trim(), "", "✨ Brand new & sealed, never used."];
  const specifics = Object.entries(r.attributes).filter(([, v]) => v.trim());
  if (r.brand.trim()) parts.push(`Brand: ${r.brand.trim()}`);
  for (const [k, v] of specifics) if (k.toLowerCase() !== "brand") parts.push(`${k}: ${v}`);
  parts.push("", "No returns. Posted within 1 working day. 📦");
  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function ManualListingHelper({ draft, platform }: { draft: ListingDraft; platform: Exclude<Platform, "ebay"> }) {
  const sb = useRef(supabaseBrowser()).current;
  const [copied, setCopied] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<{ url: string; name: string }[]>([]);

  const resolved = resolveListing(draft, platform);
  const text = platform === "facebook" ? facebookText(resolved as ResolvedListing<"facebook">) : vintedText(resolved as ResolvedListing<"vinted">);

  useEffect(() => {
    const urls = resolved.photos.map((p, i) => ({
      url: sb.storage.from("photos").getPublicUrl(p.path).data.publicUrl,
      name: `${(draft.shared.title || "item").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${i + 1}.jpg`,
    }));
    setPhotoUrls(urls);
  }, [draft, platform]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  }

  async function downloadAll() {
    for (const p of photoUrls) {
      try {
        const res = await fetch(p.url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = p.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        window.open(p.url, "_blank");
      }
    }
  }

  const label = platform === "facebook" ? "Facebook Marketplace" : "Vinted";
  return (
    <div className="manual-helper">
      <div className="row between">
        <h4 style={{ margin: 0 }}>Post on {label}</h4>
        <span className="chip s-blocked small">manual — no API</span>
      </div>
      <p className="muted small">
        {label} can&apos;t be auto-posted, so here&apos;s everything ready to paste. Price: <strong>{formatPence(resolved.pricePence)}</strong>
        {" · "}Condition: {resolved.condition ? CONDITION_LABEL[resolved.condition] : "—"}
        {platform === "vinted" && ` · Parcel: ${(resolved as ResolvedListing<"vinted">).fields.parcelSize || "set parcel size"}`}
      </p>
      <textarea readOnly value={text} rows={10} className="manual-text" onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? "Copied ✓" : "Copy listing text"}</button>
        {photoUrls.length > 0 && <button onClick={downloadAll}>Download {photoUrls.length} photo{photoUrls.length > 1 ? "s" : ""}</button>}
      </div>
      {photoUrls.length > 0 && (
        <div className="manual-thumbs">
          {photoUrls.map((p, i) => (
            <a key={i} href={p.url} download={p.name} target="_blank" rel="noreferrer" title="Open / save photo">
              <img src={p.url} alt={`Photo ${i + 1}`} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
