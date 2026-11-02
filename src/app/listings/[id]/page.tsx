"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConditionIn, FieldShell, InheritTag, PriceIn, ProvBadge, QtyIn, TextIn } from "@/components/Fields";
import { PhotoStrip } from "@/components/PhotoStrip";
import { ReviewModal, type PlatformRow } from "@/components/ReviewModal";
import { EbayFieldsPanel, FacebookFieldsPanel, VintedFieldsPanel } from "@/components/PlatformPanels";
import {
  formatPence,
  isOverridden,
  resetAttributeOverride,
  resetOverride,
  resolveListing,
  setAttributeOverride,
  setOverride,
} from "@/lib/listing/resolve";
import { PLATFORMS, PLATFORM_LABEL, type InheritableFields, type ListingDraft, type Platform } from "@/lib/listing/types";
import { blockingCount, validatePlatform, type Issue } from "@/lib/listing/validate";

type Tab = "shared" | Platform;

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [tab, setTab] = useState<Tab>("shared");
  const [save, setSave] = useState<"saved" | "saving" | "unsaved" | string>("saved");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [notes, setNotes] = useState("");
  const [aiOn, setAiOn] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ListingDraft | null>(null);

  const load = useCallback(async () => {
    const j = await (await fetch(`/api/listings/${id}`)).json();
    if (j.error) return setSave(j.error);
    setDraft(j.draft);
    latest.current = j.draft;
    setRows(j.platformRows);
  }, [id]);
  useEffect(() => {
    load();
    fetch("/api/features").then((r) => r.json()).then((f) => setAiOn(Boolean(f.ai))).catch(() => {});
  }, [load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!latest.current) return;
    setSave("saving");
    const r = await fetch(`/api/listings/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: latest.current }) });
    const j = await r.json();
    setSave(r.ok ? "saved" : `Save failed: ${j.error}`);
  }, [id]);

  const update = useCallback(
    (fn: (d: ListingDraft) => ListingDraft) => {
      setDraft((d) => {
        if (!d) return d;
        const next = fn(d);
        latest.current = next;
        return next;
      });
      setSave("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  const issues = useMemo(() => {
    if (!draft) return {} as Record<Platform, Issue[]>;
    return Object.fromEntries(PLATFORMS.map((p) => [p, draft.platforms[p].enabled ? validatePlatform(draft, p) : []])) as Record<Platform, Issue[]>;
  }, [draft]);

  if (!draft) return <main className="page"><p className="muted">{save === "saved" ? "Loading…" : save}</p></main>;

  const enabled = PLATFORMS.filter((p) => draft.platforms[p].enabled);
  const allIssues = enabled.flatMap((p) => issues[p]);
  const blocking = blockingCount(allIssues);
  const prov = draft.ai.provenance;

  const setSharedField = <K extends keyof InheritableFields>(key: K, value: InheritableFields[K], provKey: string = key) =>
    update((d) => ({ ...d, shared: { ...d.shared, [key]: value }, ai: { ...d.ai, provenance: { ...d.ai.provenance, [provKey]: "user" } } }));
  const confirm = (provKey: string) => update((d) => ({ ...d, ai: { ...d.ai, provenance: { ...d.ai.provenance, [provKey]: "confirmed" } } }));
  const errFor = (p: Tab, field: string) => (p === "shared" ? undefined : issues[p]?.find((i) => i.field === field && i.severity === "error")?.message);

  async function runAi() {
    await flush();
    setAiBusy(true);
    setAiErr("");
    const r = await fetch(`/api/listings/${id}/ai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes }) });
    const j = await r.json();
    setAiBusy(false);
    if (!r.ok) return setAiErr(j.error);
    setDraft(j.draft);
    latest.current = j.draft;
  }

  async function del() {
    if (!confirm_("Delete this item and its photos?")) return;
    const r = await fetch(`/api/listings/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (r.ok) router.push("/");
    else alert(j.error);
  }

  // ---------- inherited field renderer (works on shared + platform tabs) ----------
  function inheritedFields(t: Tab) {
    const isShared = t === "shared";
    const r = isShared ? null : resolveListing(draft!, t as Platform);
    const val = <K extends keyof InheritableFields>(k: K): InheritableFields[K] => (isShared ? draft!.shared[k] : (r![k] as InheritableFields[K]));
    const set = <K extends Exclude<keyof InheritableFields, "attributes">>(k: K, v: InheritableFields[K]) =>
      isShared ? setSharedField(k, v) : update((d) => setOverride(d, t as Platform, k, v));
    const tag = (k: keyof InheritableFields) =>
      isShared ? undefined : <InheritTag overridden={isOverridden(draft!, t as Platform, k)} onReset={() => update((d) => resetOverride(d, t as Platform, k))} />;
    const sharedProv = (k: string) => (isShared || !isOverridden(draft!, t as Platform, k as keyof InheritableFields) ? prov[k] : undefined);

    const attrs = val("attributes");
    const attrNames = Object.keys({ ...draft!.shared.attributes, ...(isShared ? {} : draft!.platforms[t as Platform].overrides.attributes ?? {}) });

    return (
      <>
        <FieldShell label="Title" error={errFor(t, "title")} hint={`${val("title").length} characters${t === "ebay" ? " (eBay max 80)" : ""}`}
          extra={<>{tag("title")}<ProvBadge p={sharedProv("title")} onConfirm={() => confirm("title")} /></>}>
          <TextIn value={val("title")} onChange={(v) => set("title", v)} />
        </FieldShell>
        <FieldShell label="Description" error={errFor(t, "description")}
          extra={<>{tag("description")}<ProvBadge p={sharedProv("description")} onConfirm={() => confirm("description")} /></>}>
          <TextIn multiline value={val("description")} onChange={(v) => set("description", v)} />
        </FieldShell>
        <div className="grid3">
          <FieldShell label="Price" error={errFor(t, "pricePence")} extra={tag("pricePence")}>
            <PriceIn value={val("pricePence")} onChange={(v) => set("pricePence", v)} />
          </FieldShell>
          <FieldShell label="Quantity" error={errFor(t, "quantity")} extra={tag("quantity")}>
            <QtyIn value={val("quantity")} onChange={(v) => set("quantity", v)} />
          </FieldShell>
          <FieldShell label="Condition" error={errFor(t, "condition")} extra={tag("condition")}>
            <ConditionIn value={val("condition")} onChange={(v) => set("condition", v)} />
          </FieldShell>
        </div>
        <FieldShell label="Brand" error={errFor(t, "brand")} hint="Leave empty if unbranded or unknown."
          extra={<>{tag("brand")}<ProvBadge p={sharedProv("brand")} onConfirm={() => confirm("brand")} /></>}>
          <TextIn value={val("brand")} onChange={(v) => set("brand", v)} />
        </FieldShell>

        <div className="field">
          <div className="field-head"><span className="label">Item attributes</span></div>
          {attrNames.map((name) => {
            const over = !isShared && Object.prototype.hasOwnProperty.call(draft!.platforms[t as Platform].overrides.attributes ?? {}, name);
            const v = isShared ? draft!.shared.attributes[name] ?? "" : attrs[name] ?? "";
            const err = errFor(t, `attr:${name}`);
            return (
              <div key={name} className={`attr ${err ? "has-err" : ""}`}>
                <span className="attr-name">{name}</span>
                <input value={v} onChange={(e) => {
                  const nv = e.target.value;
                  if (isShared) update((d) => ({ ...d, shared: { ...d.shared, attributes: { ...d.shared.attributes, [name]: nv } }, ai: { ...d.ai, provenance: { ...d.ai.provenance, [`attr:${name}`]: "user" } } }));
                  else update((d) => setAttributeOverride(d, t as Platform, name, nv));
                }} />
                {!over && <ProvBadge p={prov[`attr:${name}`]} onConfirm={() => confirm(`attr:${name}`)} />}
                {isShared ? (
                  <button className="ghost" onClick={() => update((d) => { const a = { ...d.shared.attributes }; delete a[name]; const pv = { ...d.ai.provenance }; delete pv[`attr:${name}`]; return { ...d, shared: { ...d.shared, attributes: a }, ai: { ...d.ai, provenance: pv } }; })}>✕</button>
                ) : over ? (
                  <button className="link" onClick={() => update((d) => resetAttributeOverride(d, t as Platform, name))}>Reset</button>
                ) : null}
                {err && <span className="err small">{err}</span>}
              </div>
            );
          })}
          <AddAttribute onAdd={(name) => isShared
            ? update((d) => ({ ...d, shared: { ...d.shared, attributes: { ...d.shared.attributes, [name]: "" } } }))
            : update((d) => setAttributeOverride(d, t as Platform, name, ""))} />
          {!isShared && <p className="muted small">Clearing a value here removes that attribute on {PLATFORM_LABEL[t as Platform]} only.</p>}
        </div>
      </>
    );
  }

  return (
    <main className="page editor">
      <div className="row between">
        <h1>{draft.shared.title || "New item"}</h1>
        <span className={`savestate ${save.startsWith("Save failed") ? "err" : "muted"}`}>{save === "saved" ? "All changes saved" : save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved…" : save}</span>
      </div>

      <section className="card">
        <PhotoStrip listingId={id} draft={draft} onChange={update} />
        {aiOn && <div className="ai-row">
          <input placeholder="Optional: facts you know (e.g. 'tested, fully working', 'size UK 10')" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="primary" disabled={!draft.photos.length || aiBusy} onClick={runAi}>
            {aiBusy ? "Analysing photos…" : draft.ai.generatedAt ? "Re-run AI draft" : "✨ Draft listing from photos"}
          </button>
        </div>}
        {aiErr && <p className="err">{aiErr}</p>}
        {draft.ai.generatedAt && <AiPanel draft={draft} onUsePrice={(p) => setSharedField("pricePence", p)} />}
      </section>

      <section className="card">
        <div className="field-head"><span className="label">Publish to</span></div>
        <div className="row wrap">
          {PLATFORMS.map((p) => (
            <label key={p} className="check">
              <input type="checkbox" checked={draft.platforms[p].enabled}
                onChange={(e) => update((d) => ({ ...d, platforms: { ...d.platforms, [p]: { ...d.platforms[p], enabled: e.target.checked } } }))} />
              {PLATFORM_LABEL[p]}
              {p !== "ebay" && <span className="chip s-blocked small">awaiting approval</span>}
            </label>
          ))}
        </div>
      </section>

      <div className="tabs">
        <button className={tab === "shared" ? "on" : ""} onClick={() => setTab("shared")}>Shared listing</button>
        {enabled.map((p) => (
          <button key={p} className={tab === p ? "on" : ""} onClick={() => setTab(p)}>
            {PLATFORM_LABEL[p]}
            {blockingCount(issues[p]) > 0 && <span className="count">{blockingCount(issues[p])}</span>}
          </button>
        ))}
      </div>

      <section className="card tabbody">
        {tab === "shared" ? (
          <>
            <p className="muted small">Every selected platform uses these values unless you change them on that platform's tab.</p>
            {inheritedFields("shared")}
          </>
        ) : draft.platforms[tab].enabled ? (
          <>
            <h3>{PLATFORM_LABEL[tab]} settings</h3>
            {tab === "ebay" && <EbayFieldsPanel draft={draft} update={update} issues={issues.ebay} />}
            {tab === "facebook" && <FacebookFieldsPanel draft={draft} update={update} issues={issues.facebook} />}
            {tab === "vinted" && <VintedFieldsPanel draft={draft} update={update} issues={issues.vinted} />}
            <h3>Listing content on {PLATFORM_LABEL[tab]}</h3>
            {inheritedFields(tab)}
          </>
        ) : (
          <p className="muted">Select {PLATFORM_LABEL[tab]} above to edit it.</p>
        )}
      </section>

      <section className="card">
        <h3>Before publishing</h3>
        {enabled.length === 0 ? (
          <p className="muted">Select at least one platform.</p>
        ) : allIssues.length === 0 ? (
          <p className="ok">Everything required is filled in.</p>
        ) : (
          <ul className="issues">
            {allIssues.map((i, n) => (
              <li key={n} className={i.severity}>
                <button className="link" onClick={() => setTab(tabForIssue(draft, i))}>
                  {PLATFORM_LABEL[i.platform]}
                </button>
                : {i.message}
              </li>
            ))}
          </ul>
        )}
        <PlatformStatus rows={rows} />
        <div className="row between">
          <button className="ghost danger" onClick={del}>Delete item</button>
          <button className="primary big" disabled={enabled.length === 0} onClick={async () => { await flush(); setReviewing(true); }}>
            Review & publish{blocking ? ` (${blocking} to fix)` : ""}
          </button>
        </div>
      </section>

      {reviewing && (
        <ReviewModal listingId={id} onClose={() => setReviewing(false)} onPublished={() => load()} />
      )}
    </main>
  );
}

const confirm_ = (m: string) => typeof window !== "undefined" && window.confirm(m);

const INHERITED = new Set(["title", "description", "pricePence", "quantity", "condition", "brand", "photoIds"]);
/** Send the user to where the problem can be fixed: the platform tab for platform settings/overrides, else Shared. */
function tabForIssue(draft: ListingDraft, i: Issue): Tab {
  const o = draft.platforms[i.platform].overrides;
  if (i.field.startsWith("attr:")) {
    const name = i.field.slice(5);
    const required = i.platform === "ebay" && draft.platforms.ebay.fields.requiredAspects.includes(name);
    return o.attributes && name in o.attributes ? i.platform : required ? i.platform : "shared";
  }
  if (INHERITED.has(i.field)) return i.field in o ? i.platform : "shared";
  return i.platform;
}

function AddAttribute({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="row">
      <input placeholder="Add attribute (e.g. Colour, Size, Model)" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); setName(""); } }} />
      <button disabled={!name.trim()} onClick={() => { onAdd(name.trim()); setName(""); }}>Add</button>
    </div>
  );
}

function AiPanel({ draft, onUsePrice }: { draft: ListingDraft; onUsePrice: (p: number) => void }) {
  const ai = draft.ai;
  return (
    <div className="aipanel">
      {ai.itemType && <p><strong>Looks like:</strong> {ai.itemType}</p>}
      {ai.questions.length > 0 && (
        <div><strong>Please confirm:</strong><ul>{ai.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>
      )}
      {ai.visibleDefects.length > 0 && (
        <div><strong>Visible wear/damage:</strong><ul>{ai.visibleDefects.map((q) => <li key={q}>{q}</li>)}</ul></div>
      )}
      {ai.uncertainties.length > 0 && (
        <div className="muted"><strong>Unsure about:</strong> {ai.uncertainties.join("; ")}</div>
      )}
      {ai.priceEstimate && (
        <div className="estimate">
          <strong>Price estimate (not verified):</strong> {formatPence(ai.priceEstimate.lowPence)}–{formatPence(ai.priceEstimate.highPence)}
          <span className="muted small"> — {ai.priceEstimate.basis}</span>
          <button className="link" onClick={() => onUsePrice(Math.round((ai.priceEstimate!.lowPence + ai.priceEstimate!.highPence) / 2))}>use midpoint</button>
        </div>
      )}
      <p className="muted small">Condition is never set by AI. Values marked "AI" aren't confirmed until you edit or confirm them.</p>
    </div>
  );
}

function PlatformStatus({ rows }: { rows: PlatformRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="status-list">
      {rows.map((r) => (
        <div key={r.platform} className={`statusrow s-${r.status}`}>
          <strong>{PLATFORM_LABEL[r.platform]}</strong> — {r.status}
          {r.external_url && <> · <a href={r.external_url} target="_blank" rel="noreferrer">View listing</a></>}
          {r.last_error?.message && r.status !== "published" && <div className="small">{r.last_error.message}</div>}
        </div>
      ))}
    </div>
  );
}
