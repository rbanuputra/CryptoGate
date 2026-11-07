"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const [error, setError] = useState(params.get("error") ? "Invalid credentials" : "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      username: fd.get("username") as string,
      password: fd.get("password") as string,
      redirect: false,
      callbackUrl,
    });
    if (res?.error) {
      setError("Invalid credentials");
      setLoading(false);
    } else if (res?.url) {
      window.location.href = res.url;
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={onSubmit} style={{ width: 340 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>CryptoGate</h1>
          <p className="muted" style={{ marginTop: 4 }}>AI Trading Agent</p>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div className="bad" style={{ textAlign: "center", fontSize: 13 }}>{error}</div>}
          <div>
            <label className="k" htmlFor="username">Username</label>
            <input id="username" name="username" type="text" required autoFocus autoComplete="username"
              style={{ width: "100%", marginTop: 4, padding: "8px 10px" }} />
          </div>
          <div>
            <label className="k" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password"
              style={{ width: "100%", marginTop: 4, padding: "8px 10px" }} />
          </div>
          <button className="btn primary" type="submit" disabled={loading} style={{ width: "100%", padding: "10px 0", marginTop: 4 }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>

        <p className="muted" style={{ textAlign: "center", fontSize: 11, marginTop: 16 }}>
          Set ADMIN_USER / ADMIN_PASS in .env (default: admin/admin)
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p className="muted">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
