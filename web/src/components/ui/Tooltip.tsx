import * as Primitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = Primitive.Provider;

export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  if (!label) return <>{children}</>;

  return (
    <Primitive.Root>
      {/* asChild keeps the trigger's own semantics - a disabled button stays a button. */}
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 animate-fade-in rounded border border-border bg-surface-raised px-2 py-1 text-xs text-foreground shadow-popover"
        >
          {label}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
