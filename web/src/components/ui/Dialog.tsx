import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./Button";

/* ---------------------------------------------------------------------------
   One Radix dialog, two presentations.

   `modal` centres a small form. `sheet` slides in from the right and is used
   for task detail, which is deep-linked and wants to keep the list behind it
   visible on a wide screen.
--------------------------------------------------------------------------- */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  presentation?: "modal" | "sheet";
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  presentation = "modal",
  className,
  children,
  footer,
}: DialogProps) {
  const sheet = presentation === "sheet";

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/40 backdrop-blur-[2px]" />
        <Primitive.Content
          className={cn(
            "fixed z-50 flex flex-col border-border bg-surface shadow-popover focus:outline-none",
            sheet
              ? "inset-y-0 right-0 w-full border-l duration-dialog data-[state=open]:animate-fade-in sm:max-w-2xl"
              : "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border data-[state=open]:animate-fade-in",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Primitive.Title className="truncate text-base font-semibold">
                {title}
              </Primitive.Title>
              {description ? (
                <Primitive.Description className="mt-0.5 text-xs text-muted-foreground">
                  {description}
                </Primitive.Description>
              ) : null}
            </div>
            <Primitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" aria-hidden />
              </Button>
            </Primitive.Close>
          </div>

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4")}>{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

export const DialogClose = Primitive.Close;
