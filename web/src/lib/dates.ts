/* ---------------------------------------------------------------------------
   Date formatting.

   Backend dates are plain `YYYY-MM-DD` calendar days (due dates, periods) or
   ISO timestamps (audit history). Calendar days are parsed as UTC and rendered
   with a UTC formatter, so a due date never shifts a day for a user west of
   Greenwich.
--------------------------------------------------------------------------- */

const DAY = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` calendar day into a UTC-midnight Date. */
export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Today as `YYYY-MM-DD`, in the viewer's own timezone. */
export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(parseDay(day).getTime() + days * DAY).toISOString().slice(0, 10);
}

/** Whole days from today to `day`. Negative means the day has passed. */
export function daysUntil(day: string): number {
  return Math.round((parseDay(day).getTime() - parseDay(todayISO()).getTime()) / DAY);
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dayNoYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const monthYear = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** `12 Mar 2026` */
export function formatDay(day: string): string {
  return dayFormat.format(parseDay(day));
}

/** `12 Mar 2026, 14:30` - for audit entries, in the viewer's timezone. */
export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** `just now`, `4h ago`, `3d ago`, then falls back to a date. */
export function relativeTime(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86_400 * 30) return `${Math.floor(seconds / 86_400)}d ago`;

  return dayFormat.format(new Date(iso));
}

/**
 * Render a reporting period the way an accountant would say it out loud.
 *
 * A period that covers exactly one calendar month, quarter or year gets its
 * proper name; anything else falls back to a date range.
 */
export function formatPeriod(start: string, end: string): string {
  const from = parseDay(start);
  const to = parseDay(end);

  const startsMonth = from.getUTCDate() === 1;
  const endsMonth =
    to.getUTCDate() ===
    new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate();

  if (startsMonth && endsMonth && from.getUTCFullYear() === to.getUTCFullYear()) {
    const months = to.getUTCMonth() - from.getUTCMonth();

    if (months === 0) return monthYear.format(from);

    if (months === 2 && from.getUTCMonth() % 3 === 0) {
      return `Q${from.getUTCMonth() / 3 + 1} ${from.getUTCFullYear()}`;
    }

    if (months === 11 && from.getUTCMonth() === 0) {
      return String(from.getUTCFullYear());
    }
  }

  const left =
    from.getUTCFullYear() === to.getUTCFullYear()
      ? dayNoYear.format(from)
      : dayFormat.format(from);

  return `${left} – ${dayFormat.format(to)}`;
}

/** How a due date should read: the wording changes, the colour follows. */
export type DueState = "done" | "overdue" | "today" | "soon" | "later";

export function dueState(day: string, completed: boolean): DueState {
  if (completed) return "done";

  const days = daysUntil(day);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

export function dueLabel(day: string, state: DueState): string {
  switch (state) {
    case "today":
      return "Due today";
    case "overdue": {
      const late = Math.abs(daysUntil(day));
      return late === 1 ? "1 day overdue" : `${late} days overdue`;
    }
    case "soon": {
      const left = daysUntil(day);
      return left === 1 ? "Due tomorrow" : `Due in ${left} days`;
    }
    default:
      return formatDay(day);
  }
}
