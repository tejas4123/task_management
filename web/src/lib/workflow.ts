import {
  CheckCircle2,
  Circle,
  CircleDot,
  Eye,
  PauseCircle,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

import type { TaskStatus } from "@/api/types";

/* ---------------------------------------------------------------------------
   How the workflow looks.

   The transition *map* is the server's business - the UI renders only the
   `allowed_transitions` each task carries, and the server re-checks anything
   it is asked to do. What lives here is presentation: the label, the tone and
   the icon for each status, and the verb for each move.

   Tone classes are written out in full rather than composed at runtime,
   because Tailwind scans source text and would not see `bg-tone-${tone}-bg`.
--------------------------------------------------------------------------- */

export type Tone = "slate" | "blue" | "amber" | "violet" | "rose" | "emerald";

export const TONE_CLASS: Record<Tone, string> = {
  slate: "bg-tone-slate-bg text-tone-slate-fg ring-tone-slate-ring",
  blue: "bg-tone-blue-bg text-tone-blue-fg ring-tone-blue-ring",
  amber: "bg-tone-amber-bg text-tone-amber-fg ring-tone-amber-ring",
  violet: "bg-tone-violet-bg text-tone-violet-fg ring-tone-violet-ring",
  rose: "bg-tone-rose-bg text-tone-rose-fg ring-tone-rose-ring",
  emerald: "bg-tone-emerald-bg text-tone-emerald-fg ring-tone-emerald-ring",
};

/** Just the saturated foreground - for column rules, dots and chart segments. */
export const TONE_FG: Record<Tone, string> = {
  slate: "text-tone-slate-fg",
  blue: "text-tone-blue-fg",
  amber: "text-tone-amber-fg",
  violet: "text-tone-violet-fg",
  rose: "text-tone-rose-fg",
  emerald: "text-tone-emerald-fg",
};

export const TONE_BAR: Record<Tone, string> = {
  slate: "bg-tone-slate-fg",
  blue: "bg-tone-blue-fg",
  amber: "bg-tone-amber-fg",
  violet: "bg-tone-violet-fg",
  rose: "bg-tone-rose-fg",
  emerald: "bg-tone-emerald-fg",
};

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  /** One line, used in empty states and tooltips. */
  blurb: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  NOT_STARTED: {
    label: "Not started",
    tone: "slate",
    icon: Circle,
    blurb: "Waiting to be picked up",
  },
  IN_PROGRESS: {
    label: "In progress",
    tone: "blue",
    icon: CircleDot,
    blurb: "Being worked on now",
  },
  WAITING_FOR_CLIENT: {
    label: "Waiting for client",
    tone: "amber",
    icon: PauseCircle,
    blurb: "Blocked until the client responds",
  },
  READY_FOR_REVIEW: {
    label: "Ready for review",
    tone: "violet",
    icon: Eye,
    blurb: "Submitted and waiting on a reviewer",
  },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    tone: "rose",
    icon: RotateCcw,
    blurb: "Sent back with review comments",
  },
  COMPLETED: {
    label: "Completed",
    tone: "emerald",
    icon: CheckCircle2,
    blurb: "Approved and closed",
  },
};

/** Board column order: the happy path first, then the two detours. */
export const BOARD_ORDER: readonly TaskStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_FOR_CLIENT",
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "COMPLETED",
];

/**
 * The verb for a move, from the acting user's point of view.
 *
 * `IN_PROGRESS` reads differently depending on where you came from - starting
 * fresh is not the same as picking work back up - so the label takes both ends.
 */
export function transitionLabel(from: TaskStatus, to: TaskStatus): string {
  if (to === "IN_PROGRESS") {
    return from === "NOT_STARTED" ? "Start work" : "Resume work";
  }

  switch (to) {
    case "WAITING_FOR_CLIENT":
      return "Waiting on client";
    case "READY_FOR_REVIEW":
      return "Submit for review";
    case "COMPLETED":
      return "Approve";
    case "CHANGES_REQUESTED":
      return "Request changes";
    default:
      return STATUS_META[to].label;
  }
}

/**
 * Moves that are a review decision rather than the assignee moving their own
 * work along. These are the two the assignee may never take on their own task,
 * and the two that only a manager or admin sees.
 */
export function isReviewDecision(to: TaskStatus): boolean {
  return to === "COMPLETED" || to === "CHANGES_REQUESTED";
}

/** A task is finished when it reaches the terminal status. */
export const isClosed = (status: TaskStatus) => status === "COMPLETED";
