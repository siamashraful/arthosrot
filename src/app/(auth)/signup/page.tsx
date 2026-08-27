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
      <h1>Create account</h1>
      <p className="auth-note">
        Arthosrot is a paper-trading platform. Accounts hold <strong>simulated money only</strong> —
        nothing here is real trading or investment advice.
      </p>
      <form onSubmit={onSubmit}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
            aria-describedby="password-help"
          />
          <span id="password-help" className="auth-help">
            At least 10 characters, mixing letters with numbers or symbols.
          </span>
        </label>
        {error ? (
          <p role="alert" className="auth-error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p>
        Already have an account? <a href="/signin">Sign in</a>
      </p>
    </main>
  );
}
