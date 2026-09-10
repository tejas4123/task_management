import type { Role } from "@/api/types";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TONE: Record<Role, string> = {
  ADMIN: "bg-tone-violet-bg text-tone-violet-fg ring-tone-violet-ring",
  MANAGER: "bg-tone-blue-bg text-tone-blue-fg ring-tone-blue-ring",
  TEAM_MEMBER: "bg-tone-slate-bg text-tone-slate-fg ring-tone-slate-ring",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        TONE[role],
        className,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
