import { ChevronsLeft, LogOut, Moon, Sun } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { RoleBadge } from "@/components/primitives/RoleBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { sectionsFor, type NavItem } from "@/lib/nav";
import { displayName, initials } from "@/lib/roles";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Whether a nav entry is the current one.
 *
 * "My tasks" and "All tasks" are the same route separated only by a query
 * parameter, so the search string has to be part of the comparison.
 */
function useIsActive() {
  const { pathname, search } = useLocation();

  return (item: NavItem) => {
    const [path, params = ""] = item.to.split("?");
    if (item.exact ? pathname !== path : !pathname.startsWith(path)) return false;

    const wantsMine = params.includes("mine=true");
    return wantsMine === search.includes("mine=true");
  };
}

export function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const isActive = useIsActive();

  if (!user) return null;

  return (
    <div className="flex h-full flex-col bg-surface">
      <div
        className={cn(
          "flex h-topbar shrink-0 items-center gap-2 border-b border-border px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="grid size-7 shrink-0 place-items-center rounded bg-primary text-[13px] font-bold text-primary-foreground">
          P
        </div>
        {collapsed ? null : (
          <>
            <span className="flex-1 truncate text-sm font-semibold tracking-tight">
              Practice
            </span>
            {onToggleCollapsed ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapsed}
                aria-label="Collapse sidebar"
                className="hidden lg:inline-flex"
              >
                <ChevronsLeft className="size-4" aria-hidden />
              </Button>
            ) : null}
          </>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {sectionsFor(user.role).map((section) => (
          <div key={section.heading} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-2 mb-2 h-px bg-border" />
            ) : (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
                {section.heading}
              </p>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);

                return (
                  <li key={item.label}>
                    <Tooltip label={collapsed ? item.label : ""} side="right">
                      <NavLink
                        to={item.to}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-primary-subtle font-medium text-primary"
                            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        {collapsed ? null : <span className="truncate">{item.label}</span>}
                      </NavLink>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-border p-2", collapsed && "px-1")}>
        <div
          className={cn(
            "flex items-center gap-2 rounded px-1.5 py-1.5",
            collapsed && "justify-center px-0",
          )}
        >
          <Avatar initials={initials(user)} id={user.id} className="size-7" />
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{displayName(user)}</p>
              <RoleBadge role={user.role} className="mt-0.5" />
            </div>
          )}
        </div>

        <div className={cn("mt-1 flex gap-1", collapsed && "flex-col items-center")}>
          <Tooltip label="Toggle theme" side="right">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? (
                <Sun className="size-4" aria-hidden />
              ) : (
                <Moon className="size-4" aria-hidden />
              )}
            </Button>
          </Tooltip>
          <Tooltip label="Sign out" side="right">
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
