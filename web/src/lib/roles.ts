import type { Role, Task, User } from "@/api/types";

/* ---------------------------------------------------------------------------
   Who may see which controls.

   These mirror the server's rules so the UI can hide what would be refused.
   Hiding a button is a courtesy, not a control - every one of these is checked
   again by the service that owns the data.
--------------------------------------------------------------------------- */

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEAM_MEMBER: "Team member",
};

/** Admin and manager both run the practice; only admin manages the setup. */
export const canManage = (role: Role) => role === "ADMIN" || role === "MANAGER";
export const isAdmin = (role: Role) => role === "ADMIN";

/** Assign, reassign and set deadlines. */
export const canAssign = canManage;

/** See every task rather than only your own. */
export const canSeeAllTasks = canManage;

/**
 * Review someone else's submitted work.
 *
 * The bar is assignment, not role: a manager holding the task is its author,
 * and an author does not approve their own work. That is why the check takes
 * the task and not just the role.
 */
export function canReview(user: User, task: Pick<Task, "assigned_to_id">): boolean {
  return canManage(user.role) && task.assigned_to_id !== user.id;
}

/** Why the review buttons are disabled, or null when they are not. */
export function reviewBlockedReason(
  user: User,
  task: Pick<Task, "assigned_to_id">,
): string | null {
  if (!canManage(user.role)) return "Only a manager or admin can review work.";
  if (task.assigned_to_id === user.id) return "You can't review work assigned to you.";
  return null;
}

type NameParts = Pick<User, "first_name" | "last_name" | "username">;

export const displayName = (user: NameParts) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

export function initials(user: NameParts): string {
  const first = user.first_name?.[0] ?? user.username[0] ?? "?";
  const second = user.last_name?.[0] ?? "";
  return (first + second).toUpperCase();
}
