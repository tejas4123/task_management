import { ArrowRight, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "@/api";
import { config } from "@/api/config";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/** The seeded accounts, in the order a reviewer would want to try them. */
const DEMO_ACCOUNTS = [
  { username: "admin", role: "Admin" },
  { username: "manager1", role: "Manager" },
  { username: "manager2", role: "Manager" },
  { username: "member1", role: "Team member" },
  { username: "member2", role: "Team member" },
  { username: "member3", role: "Team member" },
  { username: "member4", role: "Team member" },
];

const DEMO_PASSWORD = "Password123!";

export function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const submit = async (user: string, pass: string) => {
    setError(null);
    setPending(user);

    try {
      await login(user, pass);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Could not reach the server.",
      );
      setPending(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(username, password);
  };

  return (
    <div className="grid h-full lg:grid-cols-2">
      <div className="flex items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="grid size-7 place-items-center rounded bg-primary text-[13px] font-bold text-primary-foreground">
              P
            </div>
            <span className="text-sm font-semibold">Practice</span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use a demo account below, or your own credentials.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Username" htmlFor="username">
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error ? (
              <p
                role="alert"
                className="rounded border border-danger/40 bg-danger-subtle px-3 py-2 text-xs text-danger"
              >
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={pending !== null}
            >
              Sign in
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          <div className="mt-8">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
              Demo accounts · {DEMO_PASSWORD}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => void submit(account.username, DEMO_PASSWORD)}
                  disabled={pending !== null}
                  title={`Sign in as ${account.role}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs transition-colors hover:border-border-strong hover:bg-surface-hover disabled:opacity-50"
                >
                  {pending === account.username ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : null}
                  {account.username}
                  <span className="text-subtle-foreground">{account.role}</span>
                </button>
              ))}
            </div>

            {config.useMock ? (
              <p className="mt-4 text-xs text-subtle-foreground">
                Running against the in-memory demo dataset. Set{" "}
                <code className="rounded bg-surface-hover px-1">VITE_USE_MOCK=false</code>{" "}
                to use the live services.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* The quiet half. Decoration only, so it is hidden from assistive tech. */}
      <div
        aria-hidden
        className="relative hidden overflow-hidden border-l border-border bg-surface lg:block"
      >
        <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_70%_-10%,hsl(var(--primary)/0.18),transparent_60%),radial-gradient(40rem_30rem_at_20%_110%,hsl(var(--primary)/0.10),transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(70% 60% at 50% 40%, black, transparent)",
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded bg-primary text-[13px] font-bold text-primary-foreground">
              P
            </div>
            <span className="text-sm font-semibold tracking-tight">Practice</span>
          </div>

          <div className="max-w-md">
            <p className="text-2xl font-semibold leading-snug tracking-tight">
              Engagements in, finished work out.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Open an engagement and its checklist writes itself. The team works the
              tasks, a manager reviews them, and recurring services roll into the next
              period on their own.
            </p>
          </div>

          <p className="text-xs text-subtle-foreground">
            Task &amp; Engagement Management
          </p>
        </div>
      </div>
    </div>
  );
}
