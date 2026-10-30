import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Kova · Payout, P&L and stock engine",
  description: "How sales commission, returns, cash collection and stock connect in a COD e-commerce business. Demo data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#070709" },
  ],
};

const foucScript = `
try {
  var saved = localStorage.getItem("kova-color-scheme");
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (saved === "light" || saved === "dark") {
    if (meta) meta.setAttribute("content", saved);
    document.documentElement.dataset.theme = saved;
  } else {
    if (meta) meta.setAttribute("content", "light dark");
    delete document.documentElement.dataset.theme;
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: foucScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
