"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<[string, string]> = [
  ["/", "Overview"],
  ["/charts", "Charts"],
  ["/screener", "Screener"],
  ["/trades", "Trades"],
  ["/strategies", "Strategies"],
  ["/signals", "Signals"],
  ["/backtest", "Backtest"],
  ["/settings", "Settings"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <span className="brand">⚡ CryptoGate</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "active" : ""}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
