"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Email + password sign-in. No emails are sent, so no rate limits or expiring links. */
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabaseBrowser();
    const creds = { email: email.trim(), password };
    const { data, error } = mode === "signin" ? await sb.auth.signInWithPassword(creds) : await sb.auth.signUp(creds);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendly(error.message) });
    if (mode === "signup" && !data.session)
      return setMsg({ ok: false, text: "Account created but Supabase wants email confirmation. Turn off 'Confirm email' in Supabase, then sign in." });
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="auth">
      <section className="auth-hero">
        <div className="auth-mark">⇄</div>
        <h1>List once.<br />Publish everywhere.</h1>
        <p>Upload your photos a single time. Crosslister builds a tidy listing, lets you tweak the price per marketplace, and publishes to eBay in one click.</p>
        <ul className="auth-points">
          <li><span>①</span> One editor for every marketplace</li>
          <li><span>②</span> Per-platform prices &amp; details</li>
          <li><span>③</span> Review, then publish in a click</li>
        </ul>
      </section>

      <section className="auth-panel">
        <div className="auth-box">
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="muted">{mode === "signin" ? "Sign in to your listings." : "Set up your Crosslister account."}</p>
          <form onSubmit={submit} className="stack" style={{ marginTop: "1rem" }}>
            <label className="fieldlabel">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </label>
            <label className="fieldlabel">
              Password
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </label>
            <button className="primary big" disabled={busy}>{busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          </form>
          {msg && <p className={msg.ok ? "ok" : "err"} style={{ marginTop: "0.8rem" }}>{msg.text}</p>}
          <p className="small" style={{ marginTop: "1rem" }}>
            {mode === "signin" ? "First time here?" : "Already have an account?"}{" "}
            <button className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function friendly(m: string) {
  if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/signups not allowed|signup.*disabled/i.test(m)) return "New sign-ups are turned off.";
  if (/already registered/i.test(m)) return "That email already has an account — sign in instead.";
  return m;
}
