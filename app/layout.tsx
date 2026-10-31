import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Kova · Payout, P&L and stock engine",
  description: "How commission, returns, cash collection and stock connect in a COD e-commerce business. Demo data.",
  metadataBase: new URL("https://kovadash.vercel.app"),
  openGraph: {
    type: "website",
    siteName: "Kova",
    title: "Your sales report says you made money. Did you?",
    description: "One view of commission, returns, courier cash and stock for COD e-commerce teams. Try the demo.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Your sales report says you made money. Did you?",
    description: "One view of commission, returns, courier cash and stock for COD e-commerce teams. Try the demo.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#f8f8f5",
};

const foucScript = `
var scheme = "light";
try {
  if (localStorage.getItem("kova-color-scheme") === "dark") scheme = "dark";
} catch (e) {}
document.querySelectorAll('meta[name="color-scheme"]').forEach(function (m) { m.setAttribute("content", scheme); });
document.documentElement.dataset.theme = scheme;
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
        <script dangerouslySetInnerHTML={{ __html: foucScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
