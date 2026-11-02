"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setState(error ? error.message : "sent");
  }

  return (
    <main className="narrow">
      <h1>Crosslister</h1>
      <p className="muted">Sign in with a one-time link.</p>
      <form onSubmit={send} className="stack">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button className="primary" disabled={state === "sending"}>Email me a sign-in link</button>
      </form>
      {state === "sent" && <p className="ok">Check your email.</p>}
      {!["idle", "sending", "sent"].includes(state) && <p className="err">{state}</p>}
    </main>
  );
}
