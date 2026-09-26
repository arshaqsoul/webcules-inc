import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Snap — Studio platform for photographers",
    template: "%s · Snap",
  },
  description:
    "Branded booking + inquiry widgets, project pipeline, secure client galleries, and payments — snap.webcules.com.",
};

export const viewport: Viewport = {
  themeColor: "#010102",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
