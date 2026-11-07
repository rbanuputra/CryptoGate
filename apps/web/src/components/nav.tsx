"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

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
  const { data: session } = useSession();

  if (path === "/login") return null;

  return (
    <nav className="nav">
      <span className="brand">⚡ CryptoGate</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "active" : ""}>
          {label}
        </Link>
      ))}
      <span style={{ flex: 1 }} />
      {session?.user && (
        <>
          <span className="muted" style={{ fontSize: 12 }}>{session.user.name}</span>
          <button className="btn" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => signOut({ callbackUrl: "/login" })}>
            Logout
          </button>
        </>
      )}
    </nav>
  );
}
