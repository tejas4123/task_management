import { MoreHorizontal } from "lucide-react";

import type { Task } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/Menu";
import { STATUS_META, isReviewDecision, transitionLabel } from "@/lib/workflow";

import { useTaskActions } from "./useTaskActions";

/**
 * The row-level action menu.
 *
 * It lists exactly `allowed_transitions` and nothing else - which is why a
 * completed task, or someone else's task, simply has no menu.
 */
export function TransitionMenu({ task }: { task: Task }) {
  const { run, dialog, transitions, pending } = useTaskActions(task);

  if (transitions.length === 0) return dialog;

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Task actions"
            loading={pending}
            onClick={(event) => event.stopPropagation()}
          >
            {pending ? null : <MoreHorizontal className="size-4" aria-hidden />}
          </Button>
        </MenuTrigger>

        <MenuContent>
          <MenuLabel>Move to</MenuLabel>
          {transitions.map((to) => {
            const Icon = STATUS_META[to].icon;
            return (
              <MenuItem
                key={to}
                danger={to === "CHANGES_REQUESTED"}
                onSelect={() => run(to)}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {transitionLabel(task.status, to)}
                {isReviewDecision(to) ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-subtle-foreground">
                    Review
                  </span>
                ) : null}
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>

      {dialog}
    </>
  );
}
