import { CalendarClock } from "lucide-react";

import { dueLabel, dueState, formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * A due date that says what it means.
 *
 * Overdue and due-today carry weight; anything further out is just a date and
 * should not shout. Overdue is red because it is late, not because of the
 * task's status - the two colour scales are kept separate on purpose.
 */
export function DueDateChip({
  due,
  completed,
  showIcon = true,
  className,
}: {
  due: string;
  completed: boolean;
  showIcon?: boolean;
  className?: string;
}) {
  const state = dueState(due, completed);

  const tone =
    state === "overdue"
      ? "text-overdue font-medium"
      : state === "today"
        ? "text-tone-amber-fg font-medium"
        : "text-muted-foreground";

  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", tone, className)}
      title={formatDay(due)}
    >
      {showIcon ? <CalendarClock className="size-3" aria-hidden /> : null}
      <span className="tabular">{dueLabel(due, state)}</span>
    </span>
  );
}
