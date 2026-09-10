import { Bot, UserCircle2 } from "lucide-react";

import type { User } from "@/api/types";
import { Avatar } from "@/components/ui/Avatar";
import { displayName, initials } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * A person, or the honest absence of one.
 *
 * `assigned_to_id` is nullable and system-generated tasks have no author at
 * all, so both gaps get their own treatment rather than an empty cell.
 */
export function UserChip({
  user,
  fallback = "Unassigned",
  system,
  className,
  hideName,
}: {
  user: User | undefined;
  fallback?: string;
  system?: boolean;
  className?: string;
  hideName?: boolean;
}) {
  if (system) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover">
          <Bot className="size-3.5" aria-hidden />
        </span>
        {hideName ? null : "System"}
      </span>
    );
  }

  if (!user) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-subtle-foreground", className)}>
        <UserCircle2 className="size-6 shrink-0 stroke-[1.25]" aria-hidden />
        {hideName ? null : fallback}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}>
      <Avatar initials={initials(user)} id={user.id} />
      {hideName ? null : <span className="truncate">{displayName(user)}</span>}
    </span>
  );
}
