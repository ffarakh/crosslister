"use client";
import { useEffect, useState } from "react";
import { formatPence, parsePounds } from "@/lib/listing/resolve";
import { CONDITIONS, CONDITION_LABEL, type Condition, type Provenance } from "@/lib/listing/types";

const PROV_LABEL: Record<Provenance, string> = {
  user: "you",
  confirmed: "confirmed",
  ai_label: "AI · read from label",
  ai_visible: "AI · from photos",
  ai_guess: "AI · guess",
};

export function ProvBadge({ p, onConfirm }: { p?: Provenance; onConfirm?: () => void }) {
  if (!p || p === "user") return null;
  return (
    <span className={`prov prov-${p}`}>
      {PROV_LABEL[p]}
      {onConfirm && p.startsWith("ai") && (
        <button type="button" className="link" onClick={onConfirm}>confirm</button>
      )}
    </span>
  );
}

export function InheritTag({ overridden, onReset }: { overridden: boolean; onReset: () => void }) {
  return overridden ? (
    <span className="inherit over">
      Platform-specific
      <button type="button" className="link" onClick={onReset}>Reset to shared value</button>
    </span>
  ) : (
    <span className="inherit">Using shared value</span>
  );
}

export function FieldShell({
  label,
  hint,
  error,
  children,
  extra,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`field ${error ? "has-err" : ""}`}>
      <div className="field-head">
        <span className="label">{label}</span>
        {extra}
      </div>
      {children}
      {hint && <div className="muted small">{hint}</div>}
      {error && <div className="err small">{error}</div>}
    </div>
  );
}

/** Text input that only commits on blur/enter-free typing; keeps cursor stable under re-renders. */
export function TextIn({ value, onChange, multiline, maxLength, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; maxLength?: number; placeholder?: string }) {
  return multiline ? (
    <textarea rows={8} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

export function PriceIn({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [txt, setTxt] = useState(value == null ? "" : (value / 100).toFixed(2));
  useEffect(() => {
    if (parsePounds(txt) !== value) setTxt(value == null ? "" : (value / 100).toFixed(2));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="prefix">
      <span>£</span>
      <input inputMode="decimal" value={txt} onChange={(e) => { setTxt(e.target.value); onChange(parsePounds(e.target.value)); }} />
    </div>
  );
}

export function QtyIn({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" min={1} step={1} value={value} onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />;
}

export function ConditionIn({ value, onChange }: { value: Condition | null; onChange: (v: Condition | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Condition | null)}>
      <option value="">— choose —</option>
      {CONDITIONS.map((c) => (
        <option key={c} value={c}>{CONDITION_LABEL[c]}</option>
      ))}
    </select>
  );
}

export { formatPence };
