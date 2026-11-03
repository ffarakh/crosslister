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
      return setMsg({ ok: false, text: "Account created but Supabase wants email confirmation. Turn off 'Confirm email' in Supabase (see setup notes), then sign in." });
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="narrow">
      <h1>Crosslister</h1>
      <form onSubmit={submit} className="stack">
        <p className="muted">{mode === "signin" ? "Sign in" : "Create your account"}</p>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
        <button className="primary" disabled={busy}>{busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="small">
        {mode === "signin" ? "First time?" : "Already have an account?"}{" "}
        <button className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
      {msg && <p className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    </main>
  );
}

function friendly(m: string) {
  if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/signups not allowed|signup.*disabled/i.test(m)) return "New sign-ups are turned off.";
  if (/already registered/i.test(m)) return "That email already has an account — sign in instead.";
  return m;
}
