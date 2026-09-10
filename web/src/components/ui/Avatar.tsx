import * as Primitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

/**
 * Initials on a tinted disc, with the tint derived from the user id so the
 * same person is the same colour everywhere.
 */
const TINTS = [
  "bg-tone-blue-bg text-tone-blue-fg",
  "bg-tone-violet-bg text-tone-violet-fg",
  "bg-tone-emerald-bg text-tone-emerald-fg",
  "bg-tone-amber-bg text-tone-amber-fg",
  "bg-tone-rose-bg text-tone-rose-fg",
];

export function Avatar({
  initials,
  id = 0,
  className,
}: {
  initials: string;
  id?: number;
  className?: string;
}) {
  return (
    <Primitive.Root
      className={cn(
        "inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full text-[10px] font-semibold",
        TINTS[id % TINTS.length],
        className,
      )}
    >
      <Primitive.Fallback>{initials}</Primitive.Fallback>
    </Primitive.Root>
  );
}
