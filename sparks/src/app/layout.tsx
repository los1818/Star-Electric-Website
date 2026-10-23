import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Same typeface as starelectric.ca.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sparks", template: "%s · Sparks" },
  description: "Field service management for Star Electric Corp.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
