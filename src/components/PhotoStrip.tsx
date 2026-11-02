"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { ListingDraft, Photo } from "@/lib/listing/types";

const MAX_EDGE = 2000;

/** Downscale only (no filters, no retouching) so uploads are fast and fit marketplace/AI size limits. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg") return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.92));
  } catch {
    return file; // e.g. HEIC the browser can't decode — upload as-is
  }
}

export function PhotoStrip({
  listingId,
  draft,
  onChange,
}: {
  listingId: string;
  draft: ListingDraft;
  onChange: (fn: (d: ListingDraft) => ListingDraft) => void;
}) {
  const sb = useRef(supabaseBrowser()).current;
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const dragFrom = useRef<number | null>(null);

  const ordered: Photo[] = draft.shared.photoIds.map((id) => draft.photos.find((p) => p.id === id)).filter((p): p is Photo => !!p);

  useEffect(() => {
    const missing = draft.photos.filter((p) => !urls[p.id]);
    if (!missing.length) return;
    sb.storage
      .from("photos")
      .createSignedUrls(missing.map((p) => p.path), 3600)
      .then(({ data }) => {
        const next = { ...urls };
        data?.forEach((d, i) => d.signedUrl && (next[missing[i].id] = d.signedUrl));
        setUrls(next);
      });
  }, [draft.photos]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return setErr("Signed out");
    setBusy((b) => b + files.length);
    for (const file of Array.from(files)) {
      try {
        const id = crypto.randomUUID();
        const blob = await downscale(file);
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/heic" ? "heic" : "jpg";
        const path = `${u.user.id}/${listingId}/${id}.${ext}`;
        const { error } = await sb.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
        if (error) throw error;
        setUrls((m) => ({ ...m, [id]: URL.createObjectURL(blob) }));
        onChange((d) => ({ ...d, photos: [...d.photos, { id, path }], shared: { ...d.shared, photoIds: [...d.shared.photoIds, id] } }));
      } catch (e) {
        setErr(`Upload failed: ${(e as Error).message}`);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }

  function move(from: number, to: number) {
    onChange((d) => {
      const ids = [...d.shared.photoIds];
      const [x] = ids.splice(from, 1);
      ids.splice(to, 0, x);
      return { ...d, shared: { ...d.shared, photoIds: ids } };
    });
  }

  async function remove(p: Photo) {
    await sb.storage.from("photos").remove([p.path]);
    onChange((d) => {
      const drop = (ids?: string[]) => ids?.filter((i) => i !== p.id);
      const platforms = structuredClone(d.platforms);
      for (const k of Object.keys(platforms) as (keyof typeof platforms)[]) {
        const o = platforms[k].overrides;
        if (o.photoIds) o.photoIds = drop(o.photoIds);
      }
      return { ...d, platforms, photos: d.photos.filter((x) => x.id !== p.id), shared: { ...d.shared, photoIds: drop(d.shared.photoIds)! } };
    });
  }

  return (
    <div>
      <div className="photos">
        {ordered.map((p, i) => (
          <figure
            key={p.id}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null && dragFrom.current !== i) move(dragFrom.current, i);
              dragFrom.current = null;
            }}
            className={i === 0 ? "cover" : ""}
          >
            {urls[p.id] ? <img src={urls[p.id]} alt={`Photo ${i + 1}`} /> : <div className="ph" />}
            <figcaption>
              {i === 0 ? <span className="badge">Cover</span> : <button onClick={() => move(i, 0)}>Make cover</button>}
              <button className="ghost" onClick={() => remove(p)} aria-label="Remove photo">✕</button>
            </figcaption>
          </figure>
        ))}
        <label className="addphoto">
          <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          {busy ? `Uploading ${busy}…` : "+ Add photos"}
        </label>
      </div>
      <p className="muted small">Drag to reorder. The first photo is the cover. Photos are uploaded as-is (resized only).</p>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
