import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { TaskStatus } from "../api/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CLIENT: "Waiting for client",
  READY_FOR_REVIEW: "Ready for review",
  CHANGES_REQUESTED: "Changes requested",
  COMPLETED: "Completed",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge badge--${status.toLowerCase()}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title ? <div className="card__header"><h2 className="card__title">{title}</h2></div> : null}
      {children}
    </section>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="note note--error">{message}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export function Loading() {
  return <p className="note loading-note"><span />Loading…</p>;
}

/**
 * Placeholder that matches the shape of the content it stands in for, so the
 * layout does not jump when real data lands.
 */
export function Skeleton({ variant = "text" }: { variant?: "text" | "heading" | "panel" | "table" }) {
  const rows = variant === "table" ? 5 : variant === "panel" ? 2 : 1;

  return (
    <div className={`skeleton skeleton--${variant}`} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton__bar" key={index} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * An empty result is a dead end unless it says what would fill it. Every
 * caller supplies the reason; most also supply the action that resolves it.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { to: string; label: string } | { onClick: () => void; label: string };
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action ? (
        "to" in action ? (
          <Link className="secondary-button" to={action.to}>{action.label}</Link>
        ) : (
          <button className="secondary-button" type="button" onClick={action.onClick}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}

/** Hold a rapidly changing value still until it settles, so filters do not fire per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

/**
 * Confirmation for actions that are awkward to undo.
 *
 * Uses <dialog showModal()> so the browser supplies the focus trap, the
 * backdrop and Escape-to-close rather than us reimplementing them badly.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog className="confirm" ref={ref} onCancel={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      {body ? <p>{body}</p> : null}
      <div className="confirm__actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary primary--danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function isOverdue(dueDate: string, status: TaskStatus): boolean {
  if (status === "COMPLETED") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}
