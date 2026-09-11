import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Icon } from "./Icon";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Errors stay long enough to read and act on; confirmations get out of the way. */
const DISMISS_AFTER: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
};

const TONE_ICON: Record<ToastTone, "check-square" | "close" | "bell"> = {
  success: "check-square",
  error: "close",
  info: "bell",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        aria-live so a screen reader announces the result of an action it
        cannot see. Errors are assertive because they usually mean the thing
        the user asked for did not happen.
      */}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <output
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
          >
            <Icon name={TONE_ICON[toast.tone]} />
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              <Icon name="close" />
            </button>
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }

  return context;
}
