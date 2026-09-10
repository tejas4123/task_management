import { LayoutGrid, Table2, X } from "lucide-react";

import { TASK_STATUSES } from "@/api/types";
import { useEngagementLookup, useUserLookup } from "@/api/queries";
import { useCurrentUser } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { formatPeriod } from "@/lib/dates";
import { canSeeAllTasks, displayName } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { STATUS_META, TONE_CLASS } from "@/lib/workflow";

import type { useTaskFilters } from "./useTaskFilters";

/**
 * Only filters the task API actually supports are offered.
 *
 * There is no free-text box here on purpose: the task list is cursor
 * paginated because it is expected to get very large, and a search that only
 * matched the pages already loaded would quietly lie. Finding one task by name
 * is what the command palette is for.
 */
export function TaskFilterBar({
  state,
}: {
  state: ReturnType<typeof useTaskFilters>;
}) {
  const user = useCurrentUser();
  const { users } = useUserLookup();
  const { engagements } = useEngagementLookup();

  const { filters, statuses, view, setView, patch, toggleStatus, clear, activeCount } =
    state;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {TASK_STATUSES.map((status) => {
          const meta = STATUS_META[status];
          const on = statuses.includes(status);
          const Icon = meta.icon;

          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                on
                  ? TONE_CLASS[meta.tone]
                  : "bg-surface text-muted-foreground ring-border hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Icon className="size-3" aria-hidden />
              {meta.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1 rounded border border-border p-0.5">
          <ViewButton
            active={view === "board"}
            onClick={() => setView("board")}
            icon={<LayoutGrid className="size-3.5" aria-hidden />}
            label="Board"
          />
          <ViewButton
            active={view === "table"}
            onClick={() => setView("table")}
            icon={<Table2 className="size-3.5" aria-hidden />}
            label="Table"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canSeeAllTasks(user.role) ? (
          <Select
            aria-label="Filter by assignee"
            className="h-8 w-auto min-w-40 text-xs"
            value={filters.assigned_to_id ?? ""}
            onChange={(event) => patch({ assignee: event.target.value || null })}
          >
            <option value="">Anyone</option>
            {users.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {displayName(candidate)}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          aria-label="Filter by engagement"
          className="h-8 w-auto min-w-52 text-xs"
          value={filters.engagement_id ?? ""}
          onChange={(event) => patch({ engagement: event.target.value || null })}
        >
          <option value="">Any engagement</option>
          {engagements.map((engagement) => (
            <option key={engagement.id} value={engagement.id}>
              {engagement.client_name} · {engagement.service_name} ·{" "}
              {formatPeriod(engagement.period_start, engagement.period_end)}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Due</span>
          <input
            type="date"
            aria-label="Due on or after"
            value={filters.due_after ?? ""}
            onChange={(event) => patch({ due_after: event.target.value || null })}
            className="h-8 rounded border border-input bg-surface px-2 text-xs text-foreground"
          />
          <span>to</span>
          <input
            type="date"
            aria-label="Due on or before"
            value={filters.due_before ?? ""}
            onChange={(event) => patch({ due_before: event.target.value || null })}
            className="h-8 rounded border border-input bg-surface px-2 text-xs text-foreground"
          />
        </div>

        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="size-3.5" aria-hidden />
            Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-surface-hover text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
