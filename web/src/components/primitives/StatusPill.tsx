import type { TaskStatus } from "@/api/types";
import { STATUS_META, TONE_CLASS } from "@/lib/workflow";
import { cn } from "@/lib/utils";

export function StatusPill({
  status,
  size = "md",
  className,
}: {
  status: TaskStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        TONE_CLASS[meta.tone],
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

/** A bare dot, for dense rows where the full pill would be noise. */
export function StatusDot({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", TONE_CLASS[meta.tone])}
      title={meta.label}
    />
  );
}
