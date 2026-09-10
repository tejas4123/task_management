import type { ReactNode } from "react";

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
