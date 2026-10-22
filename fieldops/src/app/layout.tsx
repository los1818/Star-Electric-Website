import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Star FieldOps", template: "%s · Star FieldOps" },
  description: "Field service management for Star Electric Corp.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="antialiased">{children}</body>
    </html>
  );
}
