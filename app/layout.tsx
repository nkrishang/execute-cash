import type { Metadata, Viewport } from "next";
import { Archivo, Pixelify_Sans, Recursive } from "next/font/google";
import "./globals.css";

// Display and body.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

// The morphing button's lettering: its axes interpolate between styles.
const recursive = Recursive({
  subsets: ["latin"],
  axes: ["CASL", "CRSV", "MONO", "slnt"],
  variable: "--font-recursive",
  display: "swap",
});

// The 8-bit style.
const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const title = "Execute — Never connect your wallet.";
// Same as the hero description.
const description =
  "Infrastructure for apps to let users earn onchain without wallet connections, token approvals or bridging.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://execute.cash"),
  title,
  description,
  openGraph: { type: "website", siteName: "Execute", title, description, url: "https://execute.cash" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: "#f3f2ee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${recursive.variable} ${pixelify.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
