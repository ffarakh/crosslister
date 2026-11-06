import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Crosslister", description: "List once, publish everywhere you're connected" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
