"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeReturnPath } from "@/lib/return-path";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) {
        setError(err.message ?? "Sign in failed. Try again.");
        setBusy(false);
        return;
      }
    } catch {
      // A network failure throws instead of returning an error: never leave
      // the button stuck on its busy label.
      setError("Sign in failed. Check your connection and try again.");
      setBusy(false);
      return;
    }
    // Stay busy through the navigation so the form can't be submitted twice.
    router.replace(safeReturnPath(new URLSearchParams(window.location.search).get("next")));
    router.refresh();
  }

  return (
    <main className="auth-card">
      <h1 className="ar-title">Sign in</h1>
      <form onSubmit={onSubmit}>
        <div className="ar-field">
          <label className="ar-field__label" htmlFor="email">
            Email
          </label>
          <div className="ar-input">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
        </div>
        <div className="ar-field">
          <label className="ar-field__label" htmlFor="password">
            Password
          </label>
          <div className="ar-input">
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="ar-btn ar-btn--primary ar-btn--block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="ar-body ar-secondary">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
