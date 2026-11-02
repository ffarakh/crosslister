import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Crosslister", description: "List once, publish everywhere you're connected" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">Crosslister</Link>
          <nav>
            <Link href="/">Items</Link>
            <Link href="/connections">Connections</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
