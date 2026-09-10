import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { ErrorNote } from "../components/ui";
import { Icon } from "../components/Icon";

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(username, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <div className="login__panel">
        <aside className="login__intro">
          <div className="login__brand"><span className="brand-mark">T</span> Taskline</div>
          <div><p className="eyebrow">Client operations, simplified</p><h2>Work with clarity.<br />Deliver with confidence.</h2><p>One focused place for engagements, due dates, reviews, and the team behind them.</p></div>
          <div className="login__signal"><span />Your workspace is ready</div>
        </aside>
        <form className="login__form" onSubmit={handleSubmit}>
          <div><p className="eyebrow">Welcome back</p><h1>Sign in to Taskline</h1><p className="login__hint">Enter your workspace credentials to continue.</p></div>
          <label>
            <span>Username or email</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoFocus autoComplete="username" placeholder="Your username" required />
          </label>
          <label>
            <span>Password</span>
            <span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name={showPassword ? "eye-off" : "eye"} /></button></span>
          </label>
          <ErrorNote message={error} />
          <button className="primary login__submit" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}<Icon name="chevron-right" /></button>
          <p className="login__help">Need access? Contact your workspace administrator.</p>
        </form>
      </div>
    </div>
  );
}
