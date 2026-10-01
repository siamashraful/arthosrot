"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signUp.email({ name, email, password });
      if (err) {
        setError(err.message ?? "Sign up failed. Try again.");
        setBusy(false);
        return;
      }
    } catch {
      // A network failure throws instead of returning an error: never leave
      // the button stuck on its busy label.
      setError("Sign up failed. Check your connection and try again.");
      setBusy(false);
      return;
    }
    // Stay busy through the navigation so the form can't be submitted twice.
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="auth-card">
      <h1 className="ar-title">Create account</h1>
      <p className="ar-body ar-secondary">
        Arthosrot is a paper-trading platform. Accounts hold <strong>simulated money only</strong>.
        Nothing here is real trading or investment advice.
      </p>
      <form onSubmit={onSubmit}>
        <div className="ar-field">
          <label className="ar-field__label" htmlFor="name">
            Name
          </label>
          <div className="ar-input">
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
        </div>
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
              autoComplete="new-password"
              minLength={10}
              required
              aria-describedby="password-help"
            />
          </div>
          <span id="password-help" className="ar-field__help">
            At least 10 characters, mixing letters with numbers or symbols.
          </span>
        </div>
        {error ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="ar-btn ar-btn--primary ar-btn--block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="ar-body ar-secondary">
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </main>
  );
}
