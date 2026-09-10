import { ListChecks } from "lucide-react";
import { Outlet } from "react-router-dom";

import { useTasks } from "@/api/queries";
import { useCurrentUser } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskFilterBar } from "@/components/tasks/TaskFilterBar";
import { TaskTable } from "@/components/tasks/TaskTable";
import { useTaskFilters } from "@/components/tasks/useTaskFilters";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { canSeeAllTasks } from "@/lib/roles";

export function Tasks() {
  const user = useCurrentUser();
  const state = useTaskFilters();

  const query = useTasks({ ...state.filters, ...(state.mine ? { mine: true } : {}) });

  const tasks = query.data?.pages.flatMap((page) => page.results) ?? [];

  // A team member's list is scoped by the server, so "mine" is already implied.
  const scoped = state.mine || !canSeeAllTasks(user.role);

  return (
    <div className="space-y-5">
      <PageHeader
        title={scoped ? "My tasks" : "All tasks"}
        description={
          scoped
            ? "Everything assigned to you, across every engagement."
            : "Every task in the practice."
        }
        actions={
          query.isFetching && !query.isPending ? (
            <span className="text-xs text-subtle-foreground">Refreshing…</span>
          ) : null
        }
      />

      <TaskFilterBar state={state} />

      {query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : !query.isPending && tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={state.activeCount > 0 ? "No tasks match these filters" : "No tasks yet"}
            description={
              state.activeCount > 0
                ? "Try widening the status or date range."
                : "Tasks appear here once an engagement has been created."
            }
            action={
              state.activeCount > 0 ? (
                <Button size="sm" onClick={state.clear}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        </Card>
      ) : state.view === "board" ? (
        <TaskBoard tasks={tasks} loading={query.isPending} />
      ) : (
        <TaskTable tasks={tasks} loading={query.isPending} />
      )}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          {/* Cursor pagination: forward only, no page numbers to jump to. */}
          <Button
            onClick={() => void query.fetchNextPage()}
            loading={query.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}

      {/* /tasks/:id renders the detail sheet over this list. */}
      <Outlet />
    </div>
  );
}
