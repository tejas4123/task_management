import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, PanelLeft, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { STORAGE_KEYS } from "@/api/config";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { SidebarContent } from "./Sidebar";

const readCollapsed = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.sidebar) === "collapsed";
  } catch {
    return false;
  }
};

/**
 * The signed-in frame.
 *
 * Guards the routes it wraps: while the stored token is being checked it shows
 * a skeleton rather than the login screen, so a reload does not flash a signed
 * -in user back to the door.
 */
export function AppShell() {
  const { status } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.sidebar, collapsed ? "collapsed" : "expanded");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  if (status === "loading") {
    return (
      <div className="flex h-full">
        <div className="hidden w-sidebar border-r border-border bg-surface lg:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-border transition-[width] lg:block",
          collapsed ? "w-sidebar-collapsed" : "w-sidebar",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(true)}
        />
      </aside>

      {/* Mobile: the same sidebar, as a sheet. */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-sidebar border-r border-border lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" aria-hidden />
          </Button>

          {collapsed ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <PanelLeft className="size-4" aria-hidden />
            </Button>
          ) : null}

          <button
            onClick={openCommandPalette}
            className="ml-auto flex h-8 w-full max-w-72 items-center gap-2 rounded border border-border bg-background px-2.5 text-left text-xs text-subtle-foreground transition-colors hover:border-border-strong"
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Search…</span>
            <kbd className="hidden shrink-0 rounded border border-border px-1 font-sans text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-content p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
