import { ArrowRight, Bot, CalendarClock, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import {
  useAssign,
  useEngagementLookup,
  useSetDueDate,
  useTask,
  useUserLookup,
} from "@/api/queries";
import type { TaskDetail as TaskDetailType, TaskHistoryEntry } from "@/api/types";
import { useCurrentUser } from "@/auth/AuthProvider";
import { DueDateChip } from "@/components/primitives/DueDateChip";
import { StatusPill } from "@/components/primitives/StatusPill";
import { ErrorState } from "@/components/primitives/States";
import { UserChip } from "@/components/primitives/UserChip";
import { useTaskActions } from "@/components/tasks/useTaskActions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { formatDay, formatPeriod, formatTimestamp, relativeTime } from "@/lib/dates";
import { canAssign, canManage, displayName, reviewBlockedReason } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { STATUS_META, TONE_BAR, transitionLabel } from "@/lib/workflow";

/** Deep-linked at /tasks/:id, rendered as a sheet over whatever is behind it. */
export function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useTask(Number(id));

  const close = () => navigate(-1);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      presentation="sheet"
      title={query.data?.title ?? "Task"}
      description={query.data ? `Task #${query.data.id}` : undefined}
    >
      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Body task={query.data} />
      )}
    </Dialog>
  );
}

function Body({ task }: { task: TaskDetailType }) {
  const user = useCurrentUser();
  const { lookup, users } = useUserLookup();
  const engagements = useEngagementLookup();
  const engagement = engagements.lookup(task.engagement_id);

  const { run, pending, dialog, transitions } = useTaskActions(task);

  const assign = useAssign();
  const setDueDate = useSetDueDate();
  const toast = useToast();

  const blockedReason = reviewBlockedReason(user, task);

  /**
   * The review pair is shown disabled, rather than hidden, when the viewer is a
   * manager who happens to own the task - "why can't I approve this?" is a
   * better question to answer than to leave the buttons missing.
   */
  const showBlockedReview =
    task.status === "READY_FOR_REVIEW" &&
    canManage(user.role) &&
    task.assigned_to_id === user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={task.status} />
        <DueDateChip due={task.due_date} completed={task.status === "COMPLETED"} />
        {task.created_by_type === "SYSTEM" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted-foreground">
            <Bot className="size-3" aria-hidden />
            Generated from a template
          </span>
        ) : null}
      </div>

      {engagement ? (
        <p className="text-xs text-muted-foreground">
          {engagement.client_name} <span className="text-subtle-foreground">·</span>{" "}
          {engagement.service_name} <span className="text-subtle-foreground">·</span>{" "}
          {formatPeriod(engagement.period_start, engagement.period_end)}
        </p>
      ) : null}

      {task.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed">{task.description}</p>
      ) : null}

      {/* --- actions ------------------------------------------------------ */}
      <div className="flex flex-wrap gap-2">
        {transitions.map((to) => {
          const Icon = STATUS_META[to].icon;
          const primary = to === "READY_FOR_REVIEW" || to === "COMPLETED";

          return (
            <Button
              key={to}
              variant={
                to === "CHANGES_REQUESTED" ? "danger" : primary ? "primary" : "secondary"
              }
              size="sm"
              disabled={pending}
              onClick={() => run(to)}
            >
              <Icon className="size-3.5" aria-hidden />
              {transitionLabel(task.status, to)}
            </Button>
          );
        })}

        {showBlockedReview
          ? (["COMPLETED", "CHANGES_REQUESTED"] as const).map((to) => (
              <Tooltip key={to} label={blockedReason}>
                {/* A disabled button swallows pointer events, so the tooltip
                    needs a wrapper it can still hear. */}
                <span className="inline-flex">
                  <Button variant="secondary" size="sm" disabled>
                    {transitionLabel(task.status, to)}
                  </Button>
                </span>
              </Tooltip>
            ))
          : null}

        {transitions.length === 0 && !showBlockedReview ? (
          <p className="text-xs text-subtle-foreground">
            {task.status === "COMPLETED"
              ? "This task is complete. Completed is the end of the workflow."
              : "No actions available to you on this task."}
          </p>
        ) : null}

        {pending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>

      {/* --- facts -------------------------------------------------------- */}
      <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-border p-4 sm:grid-cols-2">
        <Fact label="Assignee">
          {canAssign(user.role) ? (
            <Select
              aria-label="Assign this task"
              className="h-8 text-xs"
              value={task.assigned_to_id ?? ""}
              disabled={assign.isPending}
              onChange={(event) => {
                const value = event.target.value;
                assign
                  .mutateAsync({
                    id: task.id,
                    assignedToId: value ? Number(value) : null,
                  })
                  .then(() => toast.success("Assignment updated."))
                  .catch((cause: unknown) => toast.fromError(cause));
              }}
            >
              <option value="">Unassigned</option>
              {users.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {displayName(candidate)}
                </option>
              ))}
            </Select>
          ) : (
            <UserChip user={lookup(task.assigned_to_id)} />
          )}
        </Fact>

        <Fact label="Due date">
          {canAssign(user.role) ? (
            <input
              type="date"
              aria-label="Set the due date"
              value={task.due_date}
              disabled={setDueDate.isPending}
              onChange={(event) => {
                setDueDate
                  .mutateAsync({ id: task.id, dueDate: event.target.value })
                  .then(() => toast.success("Due date updated."))
                  .catch((cause: unknown) => toast.fromError(cause));
              }}
              className="h-8 rounded border border-input bg-surface px-2 text-xs text-foreground"
            />
          ) : (
            <span className="tabular inline-flex items-center gap-1 text-xs">
              <CalendarClock className="size-3 text-subtle-foreground" aria-hidden />
              {formatDay(task.due_date)}
            </span>
          )}
        </Fact>

        <Fact label="Created by">
          <UserChip
            user={lookup(task.created_by_id)}
            system={task.created_by_type === "SYSTEM"}
          />
        </Fact>

        <Fact label="Completed">
          <span className="tabular text-xs">
            {task.completed_at ? formatTimestamp(task.completed_at) : "—"}
          </span>
        </Fact>
      </dl>

      <History entries={task.history} />

      {dialog}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The audit trail.
 *
 * Every row here was written in the same transaction as the status change it
 * describes, so this is the whole story of the task and not a best effort.
 */
function History({ entries }: { entries: TaskHistoryEntry[] }) {
  const { lookup } = useUserLookup();

  return (
    <section>
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
        History
      </h3>

      {entries.length === 0 ? (
        <p className="text-xs text-subtle-foreground">
          Nothing has happened to this task yet.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {entries.map((entry) => {
            const actor = lookup(entry.changed_by_id);
            const meta = STATUS_META[entry.to_status];

            return (
              <li key={entry.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[1.4rem] top-1 size-2 rounded-full ring-4 ring-surface",
                    TONE_BAR[meta.tone],
                  )}
                />

                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <span className="font-medium">
                    {actor ? displayName(actor) : "Someone"}
                  </span>
                  <span className="text-muted-foreground">moved it</span>
                  <span className="text-muted-foreground">
                    {STATUS_META[entry.from_status].label}
                  </span>
                  <ArrowRight className="size-3 text-subtle-foreground" aria-hidden />
                  <span className="font-medium">{meta.label}</span>
                  <time
                    className="ml-auto shrink-0 text-subtle-foreground"
                    dateTime={entry.created_at}
                    title={formatTimestamp(entry.created_at)}
                  >
                    {relativeTime(entry.created_at)}
                  </time>
                </div>

                {entry.comment ? (
                  <p className="mt-1.5 rounded border border-border bg-surface-hover/60 px-2.5 py-1.5 text-xs leading-relaxed">
                    {entry.comment}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
