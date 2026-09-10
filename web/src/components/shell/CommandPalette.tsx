import { Command } from "cmdk";
import { Briefcase, Building2, Moon, Plus, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useClients, useEngagements, useTasks } from "@/api/queries";
import { useCurrentUser } from "@/auth/AuthProvider";
import { StatusDot } from "@/components/primitives/StatusPill";
import { formatPeriod } from "@/lib/dates";
import { canManage } from "@/lib/roles";
import { useTheme } from "@/lib/theme";

/**
 * Everything reachable from one keystroke.
 *
 * Only the first page of tasks is searched. That is deliberate: the list is
 * cursor paginated because it is expected to get very large, and a palette
 * that pulled the whole table to filter it in the browser would be the one
 * place in the app that ignores that.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { theme, toggle } = useTheme();

  const tasks = useTasks({ page_size: 100 });
  const { data: engagements } = useEngagements();
  const { data: clients } = useClients();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const taskRows = tasks.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[15vh] z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-popover"
      overlayClassName="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
    >
      <Command.Input
        placeholder="Search tasks, engagements and clients…"
        className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-subtle-foreground"
      />

      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          Nothing matched.
        </Command.Empty>

        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground">
          {canManage(user.role) ? (
            <Item onSelect={() => run(() => navigate("/engagements?new=1"))}>
              <Plus className="size-4" aria-hidden />
              New engagement
            </Item>
          ) : null}
          <Item onSelect={() => run(toggle)}>
            {theme === "dark" ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
            Switch to {theme === "dark" ? "light" : "dark"} theme
          </Item>
        </Command.Group>

        {taskRows.length ? (
          <Command.Group heading="Tasks" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground">
            {taskRows.slice(0, 40).map((task) => (
              <Item
                key={task.id}
                value={`task-${task.id} ${task.title}`}
                onSelect={() => run(() => navigate(`/tasks/${task.id}`))}
              >
                <StatusDot status={task.status} />
                <span className="truncate">{task.title}</span>
              </Item>
            ))}
          </Command.Group>
        ) : null}

        {engagements?.results.length ? (
          <Command.Group heading="Engagements" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground">
            {engagements.results.slice(0, 20).map((engagement) => (
              <Item
                key={engagement.id}
                value={`engagement-${engagement.id} ${engagement.client_name} ${engagement.service_name}`}
                onSelect={() => run(() => navigate(`/engagements/${engagement.id}`))}
              >
                <Briefcase className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
                <span className="truncate">
                  {engagement.client_name} · {engagement.service_name}
                </span>
                <span className="tabular ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatPeriod(engagement.period_start, engagement.period_end)}
                </span>
              </Item>
            ))}
          </Command.Group>
        ) : null}

        {clients?.results.length ? (
          <Command.Group heading="Clients" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground">
            {clients.results.map((client) => (
              <Item
                key={client.id}
                value={`client-${client.id} ${client.name}`}
                onSelect={() => run(() => navigate(`/clients?highlight=${client.id}`))}
              >
                <Building2 className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
                <span className="truncate">{client.name}</span>
              </Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}

function Item({
  children,
  value,
  onSelect,
}: {
  children: React.ReactNode;
  value?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm outline-none data-[selected=true]:bg-surface-hover"
    >
      {children}
    </Command.Item>
  );
}

/** Opens the palette from a click, for people who do not know the shortcut. */
export function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
  );
}
