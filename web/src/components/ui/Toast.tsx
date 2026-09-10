import { AlertTriangle, Check, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "@/api";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Toasts.

   The important one is `fromError`: the backend answers every failure with a
   `detail` string that already reads as a sentence - "Cannot transition from
   NOT_STARTED to COMPLETED." - so the UI shows that verbatim rather than
   inventing its own wording for a rule it does not own.
--------------------------------------------------------------------------- */

type Variant = "success" | "error";

interface Toast {
  id: number;
  variant: Variant;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  fromError: (cause: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER = 5_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: Variant, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, variant, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      fromError: (cause, fallback = "Something went wrong.") =>
        push("error", cause instanceof ApiError ? cause.message : fallback),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-lg border bg-surface-raised px-3 py-2.5 shadow-popover",
              toast.variant === "error" ? "border-danger/40" : "border-border",
            )}
          >
            {toast.variant === "success" ? (
              <Check className="mt-0.5 size-4 shrink-0 text-tone-emerald-fg" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            )}
            <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="rounded p-0.5 text-subtle-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
