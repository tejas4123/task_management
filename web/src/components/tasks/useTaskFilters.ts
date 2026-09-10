import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { TaskFilters, TaskStatus } from "@/api/types";
import { TASK_STATUSES } from "@/api/types";

export type ViewMode = "board" | "table";

const VIEW_KEY = "tm.taskview";

const readView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "board";
  } catch {
    return "board";
  }
};

/* ---------------------------------------------------------------------------
   Task filters, held in the URL.

   The URL is the state, so a filtered view is a link: paste it to a colleague
   and they see the same list, and the back button walks the filter history.
--------------------------------------------------------------------------- */

export function useTaskFilters() {
  const [params, setParams] = useSearchParams();

  const statuses = useMemo(() => {
    const raw = params.get("status");
    if (!raw) return [];
    return raw
      .split(",")
      .filter((value): value is TaskStatus =>
        (TASK_STATUSES as readonly string[]).includes(value),
      );
  }, [params]);

  const numeric = (key: string) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };

  const filters: TaskFilters = useMemo(
    () => ({
      ...(statuses.length ? { status: statuses } : {}),
      ...(params.get("mine") === "true" ? { mine: true } : {}),
      ...(numeric("assignee") ? { assigned_to_id: numeric("assignee") } : {}),
      ...(numeric("engagement") ? { engagement_id: numeric("engagement") } : {}),
      ...(params.get("due_before") ? { due_before: params.get("due_before")! } : {}),
      ...(params.get("due_after") ? { due_after: params.get("due_after")! } : {}),
      page_size: 100,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, statuses],
  );

  const view: ViewMode = params.get("view") === "table" ? "table" : params.get("view") === "board" ? "board" : readView();

  const patch = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setView = useCallback(
    (next: ViewMode) => {
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        /* ignore */
      }
      patch({ view: next });
    },
    [patch],
  );

  const toggleStatus = useCallback(
    (status: TaskStatus) => {
      const next = statuses.includes(status)
        ? statuses.filter((value) => value !== status)
        : [...statuses, status];
      patch({ status: next.length ? next.join(",") : null });
    },
    [statuses, patch],
  );

  /** `mine` and `view` are the lens, not a filter - "clear" should not reset them. */
  const activeCount =
    statuses.length +
    (filters.assigned_to_id ? 1 : 0) +
    (filters.engagement_id ? 1 : 0) +
    (filters.due_before ? 1 : 0) +
    (filters.due_after ? 1 : 0);

  const clear = useCallback(
    () =>
      patch({
        status: null,
        assignee: null,
        engagement: null,
        due_before: null,
        due_after: null,
      }),
    [patch],
  );

  return {
    filters,
    statuses,
    mine: params.get("mine") === "true",
    view,
    setView,
    patch,
    toggleStatus,
    clear,
    activeCount,
    params,
  };
}
