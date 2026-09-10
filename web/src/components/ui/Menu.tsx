import * as Primitive from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Menu = Primitive.Root;
export const MenuTrigger = Primitive.Trigger;

export function MenuContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={4}
        className={cn(
          "z-50 min-w-48 animate-fade-in overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-popover",
          className,
        )}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  danger,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Primitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        danger && "text-danger",
      )}
    >
      {children}
    </Primitive.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <Primitive.Label className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-subtle-foreground">
      {children}
    </Primitive.Label>
  );
}

export function MenuSeparator() {
  return <Primitive.Separator className="my-1 h-px bg-border" />;
}
