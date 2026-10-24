import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const { user, login, signup, tryDemo } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => (mode === "login" ? login(email, password) : signup(email, password)));
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1 className="brand-large">Drape</h1>
        <p className="muted">Outfits built by an AI agent, using only the clothes you own.</p>

        <button className="primary wide" disabled={busy} onClick={() => run(tryDemo)}>
          Try the demo
        </button>
        <p className="muted small center">No account needed: browse a sample wardrobe and ask for outfits.</p>

        <div className="divider"><span>or</span></div>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "tab active" : "tab"} onClick={() => setMode("login")}>
            Log in
          </button>
          <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "tab active" : "tab"} onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>

        <form onSubmit={onSubmit} className="form">
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && <span className="muted small">At least 10 characters.</span>}
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="secondary wide" type="submit" disabled={busy}>
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
