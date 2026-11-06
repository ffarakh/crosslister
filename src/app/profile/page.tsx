"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { initials } from "@/components/SiteHeader";
import { supabaseBrowser } from "@/lib/supabase/browser";

type EbayStatus = { connected?: boolean; env?: string; configured?: boolean };

export default function Profile() {
  const router = useRouter();
  const sb = useRef(supabaseBrowser()).current;
  const [user, setUser] = useState<User | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [ebay, setEbay] = useState<EbayStatus | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) return router.replace("/login");
      setUser(data.user);
    });
    sb.from("listings").select("id", { count: "exact", head: true }).then(({ count }) => setItemCount(count ?? 0));
    fetch("/api/ebay/status").then((r) => r.json()).then(setEbay).catch(() => {});
  }, [sb, router]);

  async function signOut() {
    await sb.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!user) return <main className="page"><p className="muted">Loading…</p></main>;
  const created = user.created_at ? new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

  return (
    <main className="page narrowish">
      <div className="profile-hero">
        <div className="avatar xl">{initials(user.email)}</div>
        <div>
          <h1>{user.email?.split("@")[0]}</h1>
          <p className="muted">{user.email}</p>
        </div>
      </div>

      <section className="card">
        <h3>Account</h3>
        <dl className="deflist">
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Member since</dt><dd>{created}</dd>
          <dt>Items created</dt><dd>{itemCount ?? "…"}</dd>
        </dl>
      </section>

      <section className="card">
        <h3>Marketplaces</h3>
        <div className="mkt-row">
          <span>eBay UK</span>
          <span className={`chip ${ebay?.connected ? "s-published" : "s-idle"}`}>
            {!ebay ? "…" : ebay.connected ? `connected · ${ebay.env}` : "not connected"}
          </span>
        </div>
        <div className="mkt-row"><span>Facebook Marketplace</span><span className="chip s-blocked">awaiting approval</span></div>
        <div className="mkt-row"><span>Vinted UK</span><span className="chip s-blocked">awaiting approval</span></div>
        <Link href="/connections" className="button" style={{ marginTop: "0.8rem" }}>Manage connections</Link>
      </section>

      <section className="card">
        <h3>Session</h3>
        <button className="ghost danger" onClick={signOut}>Sign out</button>
      </section>
    </main>
  );
}
