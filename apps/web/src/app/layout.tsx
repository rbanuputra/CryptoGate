import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "../components/nav";

export const metadata: Metadata = {
  title: "CryptoGate — AI Trading Agent",
  description: "Regime-aware multi-strategy trading agent for Binance Futures",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
