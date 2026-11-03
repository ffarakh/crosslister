"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Email one-time code sign-in: no links to expire or get pre-opened by mail scanners. */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    setStep("code");
    setMsg({ ok: true, text: `Code sent to ${email.trim()}. Check spam too.` });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="narrow">
      <h1>Crosslister</h1>
      {step === "email" ? (
        <form onSubmit={sendCode} className="stack">
          <p className="muted">Sign in with a code sent to your email.</p>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          <button className="primary" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <p className="muted">Enter the code from your email.</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="123456"
            style={{ fontSize: "1.4rem", letterSpacing: "0.3em", textAlign: "center" }}
          />
          <button className="primary" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Sign in"}</button>
          <div className="row between">
            <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); setMsg(null); }}>Use a different email</button>
            <button type="button" className="link" disabled={busy} onClick={sendCode as unknown as () => void}>Resend code</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    </main>
  );
}

function friendly(m: string) {
  if (/rate limit/i.test(m)) return "Too many emails sent recently. Wait a bit (up to an hour) and try again.";
  if (/expired|invalid/i.test(m)) return "That code is wrong or expired. Request a new one and use the latest email.";
  return m;
}
