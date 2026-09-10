import {
  CalendarClock,
  CheckCircle2,
  Eye,
  ListChecks,
  PauseCircle,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { TaskStatus } from "@/api/types";
import { useDashboard, useTasks, useUserLookup } from "@/api/queries";
import { useCurrentUser } from "@/auth/AuthProvider";
import { DueDateChip } from "@/components/primitives/DueDateChip";
import { PageHeader } from "@/components/primitives/PageHeader";
import { StatCard } from "@/components/primitives/StatCard";
import { StatusPill } from "@/components/primitives/StatusPill";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { UserChip } from "@/components/primitives/UserChip";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { todayISO } from "@/lib/dates";
import { canManage, displayName } from "@/lib/roles";
import { STATUS_META, TONE_BAR } from "@/lib/workflow";

const OPEN_STATUSES: TaskStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_FOR_CLIENT",
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
];

const openFilter = `status=${OPEN_STATUSES.join(",")}`;

export function Dashboard() {
  const user = useCurrentUser();
  const manager = canManage(user.role);
  const today = todayISO();

  const summary = useDashboard();

  // Two small, tightly-filtered lists rather than one big fetch filtered here.
  const review = useTasks({ status: ["READY_FOR_REVIEW"], page_size: 8 });
  const upcoming = useTasks({
    status: OPEN_STATUSES,
    due_before: addWeek(today),
    page_size: 8,
    ...(manager ? {} : { mine: true }),
  });

  const data = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good ${partOfDay()}, ${user.first_name || displayName(user)}`}
        description={
          manager
            ? "Everything across the practice."
            : "The work assigned to you right now."
        }
      />

      {summary.isError ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Open"
            value={data?.open_tasks}
            hint="Not yet completed"
            icon={ListChecks}
            tone="blue"
            to={`/tasks?${openFilter}`}
            loading={summary.isPending}
          />
          <StatCard
            label="Overdue"
            value={data?.overdue}
            hint="Past the due date"
            icon={TriangleAlert}
            tone="rose"
            to={`/tasks?${openFilter}&due_before=${today}`}
            loading={summary.isPending}
            emphasis
          />
          <StatCard
            label="Due today"
            value={data?.due_today}
            hint={today}
            icon={CalendarClock}
            tone="amber"
            to={`/tasks?${openFilter}&due_after=${today}&due_before=${today}`}
            loading={summary.isPending}
          />
          <StatCard
            label="Waiting for client"
            value={data?.waiting_for_client}
            hint="Blocked externally"
            icon={PauseCircle}
            tone="amber"
            to="/tasks?status=WAITING_FOR_CLIENT"
            loading={summary.isPending}
          />
          <StatCard
            label="Waiting for review"
            value={data?.waiting_for_review}
            hint="Submitted work"
            icon={Eye}
            tone="violet"
            to="/tasks?status=READY_FOR_REVIEW"
            loading={summary.isPending}
          />
          <StatCard
            label="Completed"
            value={data?.completed}
            hint="Approved and closed"
            icon={CheckCircle2}
            tone="emerald"
            to="/tasks?status=COMPLETED"
            loading={summary.isPending}
          />
        </div>
      )}

      {data && data.total > 0 ? <Distribution byStatus={data.by_status} total={data.total} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {manager ? (
          <TaskListCard
            title="Needs your review"
            emptyTitle="Nothing waiting on you"
            emptyBody="Work submitted for review will appear here."
            query={review}
            // A manager cannot review their own work, so it is not "theirs to do".
            exclude={(assignee) => assignee === user.id}
          />
        ) : null}

        <TaskListCard
          title="Due in the next 7 days"
          emptyTitle="Nothing due this week"
          emptyBody="Tasks approaching their due date show up here."
          query={upcoming}
        />
      </div>
    </div>
  );
}

/* --- pieces -------------------------------------------------------------- */

function Distribution({
  byStatus,
  total,
}: {
  byStatus: Record<TaskStatus, number>;
  total: number;
}) {
  const segments = (Object.keys(STATUS_META) as TaskStatus[])
    .map((status) => ({ status, count: byStatus[status] ?? 0 }))
    .filter((segment) => segment.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the work sits</CardTitle>
        <span className="tabular text-xs text-muted-foreground">{total} tasks</span>
      </CardHeader>

      <div className="p-4">
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
          {segments.map((segment) => (
            <div
              key={segment.status}
              className={TONE_BAR[STATUS_META[segment.status].tone]}
              style={{ width: `${(segment.count / total) * 100}%` }}
              title={`${STATUS_META[segment.status].label}: ${segment.count}`}
            />
          ))}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((segment) => (
            <li key={segment.status} className="flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${TONE_BAR[STATUS_META[segment.status].tone]}`}
              />
              <Link
                to={`/tasks?status=${segment.status}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {STATUS_META[segment.status].label}
              </Link>
              <span className="tabular text-xs font-medium">{segment.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TaskListCard({
  title,
  emptyTitle,
  emptyBody,
  query,
  exclude,
}: {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  query: ReturnType<typeof useTasks>;
  exclude?: (assignedToId: number | null) => boolean;
}) {
  const { lookup } = useUserLookup();

  const rows = (query.data?.pages.flatMap((page) => page.results) ?? []).filter(
    (task) => !exclude?.(task.assigned_to_id),
  );

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {rows.length ? (
          <span className="tabular text-xs text-muted-foreground">{rows.length}</span>
        ) : null}
      </CardHeader>

      {query.isPending ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyBody} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((task) => (
            <li key={task.id}>
              <Link
                to={`/tasks/${task.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{task.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusPill status={task.status} size="sm" />
                    <DueDateChip
                      due={task.due_date}
                      completed={task.status === "COMPLETED"}
                    />
                  </div>
                </div>
                <UserChip user={lookup(task.assigned_to_id)} hideName />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const addWeek = (day: string) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

function partOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
