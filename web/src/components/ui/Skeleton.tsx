import { cn } from "@/lib/utils";

/** A shimmering placeholder. Match the shape of what is loading, not a spinner. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded bg-surface-hover",
        "after:absolute after:inset-0 after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-black/5 after:to-transparent dark:after:via-white/5",
        className,
      )}
      aria-hidden
    />
  );
}
