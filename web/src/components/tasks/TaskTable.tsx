import { Link } from "react-router-dom";

import { useEngagementLookup, useUserLookup } from "@/api/queries";
import type { Task } from "@/api/types";
import { DueDateChip } from "@/components/primitives/DueDateChip";
import { StatusPill } from "@/components/primitives/StatusPill";
import { UserChip } from "@/components/primitives/UserChip";
import { Skeleton } from "@/components/ui/Skeleton";

import { TransitionMenu } from "./TransitionMenu";

/** The dense view. Collapses to stacked cards below `sm`. */
export function TaskTable({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  const { lookup } = useUserLookup();
  const engagements = useEngagementLookup();

  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 8 }, (_, row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-hover/60 text-left">
            <Th className="w-[38%]">Task</Th>
            <Th>Engagement</Th>
            <Th className="w-36">Assignee</Th>
            <Th className="w-36">Due</Th>
            <Th className="w-40">Status</Th>
            <Th className="w-10" />
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => {
            const engagement = engagements.lookup(task.engagement_id);

            return (
              <tr
                key={task.id}
                className="group border-b border-border last:border-0 hover:bg-surface-hover"
              >
                <td className="px-3 py-2">
                  <Link
                    to={`/tasks/${task.id}`}
                    className="block truncate font-medium hover:text-primary"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {engagement ? (
                    <Link
                      to={`/engagements/${engagement.id}`}
                      className="block truncate hover:text-foreground"
                    >
                      {engagement.client_name} · {engagement.service_name}
                    </Link>
                  ) : (
                    <span className="text-subtle-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <UserChip user={lookup(task.assigned_to_id)} />
                </td>
                <td className="px-3 py-2">
                  <DueDateChip
                    due={task.due_date}
                    completed={task.status === "COMPLETED"}
                    showIcon={false}
                  />
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={task.status} size="sm" />
                </td>
                <td className="px-1 py-2">
                  <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <TransitionMenu task={task} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
