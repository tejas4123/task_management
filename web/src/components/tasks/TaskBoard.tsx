import { Link } from "react-router-dom";

import { useEngagementLookup, useUserLookup } from "@/api/queries";
import type { Task } from "@/api/types";
import { DueDateChip } from "@/components/primitives/DueDateChip";
import { UserChip } from "@/components/primitives/UserChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { BOARD_ORDER, STATUS_META, TONE_BAR } from "@/lib/workflow";

import { TransitionMenu } from "./TransitionMenu";

/**
 * A column per status, in workflow order.
 *
 * Deliberately not drag-and-drop. Dragging says "any column is reachable from
 * any other", which is exactly what the workflow forbids - two thirds of the
 * drops would come back as a 400. Each card offers its real moves instead.
 */
export function TaskBoard({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max gap-3">
        {BOARD_ORDER.map((status) => {
          const meta = STATUS_META[status];
          const column = tasks.filter((task) => task.status === status);

          return (
            <section key={status} className="flex w-72 shrink-0 flex-col">
              <header className="mb-2 flex items-center gap-2 px-0.5">
                <span className={cn("size-2 rounded-full", TONE_BAR[meta.tone])} />
                <h2 className="text-xs font-semibold">{meta.label}</h2>
                <span className="tabular ml-auto text-xs text-subtle-foreground">
                  {loading ? "–" : column.length}
                </span>
              </header>

              <div className="flex flex-col gap-2 rounded-lg bg-surface-hover/50 p-2">
                {loading ? (
                  <>
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </>
                ) : column.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-subtle-foreground">
                    {meta.blurb}
                  </p>
                ) : (
                  column.map((task) => <TaskCard key={task.id} task={task} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { lookup } = useUserLookup();
  const engagements = useEngagementLookup();
  const engagement = engagements.lookup(task.engagement_id);

  return (
    <article className="group relative rounded border border-border bg-surface p-2.5 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-1">
        {/* The whole card is the link; the menu sits above it in the stack. */}
        <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 after:absolute after:inset-0">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug">
            {task.title}
          </p>
          {engagement ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {engagement.client_name} · {engagement.service_name}
            </p>
          ) : null}
        </Link>

        <div className="relative z-10 -mr-1 -mt-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <TransitionMenu task={task} />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <DueDateChip due={task.due_date} completed={task.status === "COMPLETED"} />
        <div className="relative z-10">
          <UserChip user={lookup(task.assigned_to_id)} hideName />
        </div>
      </div>
    </article>
  );
}
