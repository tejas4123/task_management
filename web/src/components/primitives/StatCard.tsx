import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/workflow";
import { TONE_CLASS } from "@/lib/workflow";

/**
 * One number, and a way in.
 *
 * Every tile links somewhere - a count you cannot click is a dead end, and the
 * question after "12 overdue" is always "which twelve".
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  to,
  loading,
  emphasis,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
  to: string;
  loading?: boolean;
  /** Draw attention - used for overdue, which is the number that matters. */
  emphasis?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex flex-col justify-between gap-3 rounded-lg border bg-surface p-3.5 transition-colors hover:border-border-strong hover:bg-surface-hover",
        emphasis && value ? "border-danger/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded ring-1 ring-inset",
            TONE_CLASS[tone],
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>

      <div>
        {loading || value === undefined ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <p
            className={cn(
              "tabular text-2xl font-semibold leading-none tracking-tight",
              emphasis && value > 0 && "text-danger",
            )}
          >
            {value}
          </p>
        )}
        {hint ? (
          <p className="mt-1.5 truncate text-[11px] text-subtle-foreground">{hint}</p>
        ) : null}
      </div>
    </Link>
  );
}
