import { Inbox, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/api";
import { Button } from "@/components/ui/Button";

/** Nothing here - say so plainly and offer the way out. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 rounded-full bg-surface-hover p-3">
        <Icon className="size-5 text-subtle-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Something failed. Show the server's own sentence where there is one - it is
 * more useful than "an error occurred".
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof ApiError ? error.message : "Could not load this right now.";

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 rounded-full bg-danger-subtle p-3">
        <TriangleAlert className="size-5 text-danger" aria-hidden />
      </div>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
