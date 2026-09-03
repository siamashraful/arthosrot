"use client";

import { useState } from "react";
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
    const { error: err } = await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Sign up failed.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-card">
      <h1 style={{ fontSize: "var(--text-xl)" }}>Create account</h1>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Arthosrot is a paper-trading platform. Accounts hold <strong>simulated money only</strong> —
        nothing here is real trading or investment advice.
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
            aria-describedby="password-help"
          />
          <span id="password-help" className="muted" style={{ fontSize: "var(--text-xs)" }}>
            At least 10 characters, mixing letters with numbers or symbols.
          </span>
        </div>
        {error ? (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Already have an account? <a href="/signin">Sign in</a>
      </p>
    </main>
  );
}
