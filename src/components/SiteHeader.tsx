"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function initials(email?: string | null) {
  if (!email) return "?";
  const name = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? email[0]) + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const sb = useRef(supabaseBrowser()).current;
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    await sb.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const onLogin = pathname === "/login";

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden>⇄</span> Crosslister
      </Link>
      {!onLogin && user && (
        <div className="topnav">
          <nav>
            <Link href="/" className={pathname === "/" ? "on" : ""}>Items</Link>
            <Link href="/connections" className={pathname.startsWith("/connections") ? "on" : ""}>Connections</Link>
          </nav>
          <div className="usermenu" ref={menuRef}>
            <button className="avatar" onClick={() => setOpen((o) => !o)} aria-label="Account" title={user.email ?? ""}>
              {initials(user.email)}
            </button>
            {open && (
              <div className="menu">
                <div className="menu-head">
                  <div className="avatar big">{initials(user.email)}</div>
                  <div className="menu-email">{user.email}</div>
                </div>
                <Link href="/profile" className="menu-item">Profile &amp; account</Link>
                <Link href="/connections" className="menu-item">Connections</Link>
                <button className="menu-item danger" onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
