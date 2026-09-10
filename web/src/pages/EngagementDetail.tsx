import { ArrowLeft, ListChecks } from "lucide-react";
import { Link, Outlet, useParams } from "react-router-dom";

import { useEngagement, useTasks, useUserLookup } from "@/api/queries";
import { DueDateChip } from "@/components/primitives/DueDateChip";
import { PageHeader } from "@/components/primitives/PageHeader";
import { StatusPill } from "@/components/primitives/StatusPill";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { UserChip } from "@/components/primitives/UserChip";
import { TransitionMenu } from "@/components/tasks/TransitionMenu";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatPeriod } from "@/lib/dates";
import { displayName } from "@/lib/roles";

import { FREQUENCY_LABEL } from "./Engagements";

export function EngagementDetail() {
  const { id } = useParams();
  const engagementId = Number(id);

  const engagement = useEngagement(engagementId);
  const tasks = useTasks({ engagement_id: engagementId, page_size: 100 });
  const { lookup } = useUserLookup();

  const rows = tasks.data?.pages.flatMap((page) => page.results) ?? [];
  const done = rows.filter((task) => task.status === "COMPLETED").length;

  if (engagement.isError) {
    return (
      <Card>
        <ErrorState error={engagement.error} onRetry={() => void engagement.refetch()} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/engagements">
          <ArrowLeft className="size-3.5" aria-hidden />
          Engagements
        </Link>
      </Button>

      {engagement.isPending ? (
        <Skeleton className="h-16 w-full max-w-md" />
      ) : (
        <PageHeader
          title={engagement.data.client_name}
          description={`${engagement.data.service_name} · ${FREQUENCY_LABEL[engagement.data.frequency]} · ${formatPeriod(
            engagement.data.period_start,
            engagement.data.period_end,
          )}`}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          {rows.length ? (
            <div className="flex items-center gap-2.5">
              <span className="tabular text-xs text-muted-foreground">
                {done} of {rows.length} complete
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-tone-emerald-fg transition-[width]"
                  style={{ width: `${(done / rows.length) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
        </CardHeader>

        {tasks.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, row) => (
              <Skeleton key={row} className="h-11 w-full" />
            ))}
          </div>
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No tasks on this engagement"
            description="Tasks are generated from the service's templates once the engagement is created."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((task) => (
              <li
                key={task.id}
                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/engagements/${engagementId}/tasks/${task.id}`}
                    className="block truncate text-sm font-medium hover:text-primary"
                  >
                    {task.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusPill status={task.status} size="sm" />
                    <DueDateChip
                      due={task.due_date}
                      completed={task.status === "COMPLETED"}
                    />
                    <span className="text-xs text-subtle-foreground">
                      {lookup(task.assigned_to_id)
                        ? displayName(lookup(task.assigned_to_id)!)
                        : "Unassigned"}
                    </span>
                  </div>
                </div>

                <UserChip user={lookup(task.assigned_to_id)} hideName />

                <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <TransitionMenu task={task} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* /engagements/:id/tasks/:taskId opens the same detail sheet. */}
      <Outlet />
    </div>
  );
}
