import { ChevronDown, Layers, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useCreateService, useServices, useTemplates } from "@/api/queries";
import type { Frequency } from "@/api/types";
import { useCurrentUser } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { isAdmin } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { FREQUENCY_LABEL } from "./Engagements";

export function Services() {
  const user = useCurrentUser();
  const admin = isAdmin(user.role);

  const query = useServices();
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = query.data?.results ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Services"
        description="What the practice offers, and the checklist each one generates."
        actions={
          admin ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              New service
            </Button>
          ) : null
        }
      />

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="No services yet" />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((service) => {
            const expanded = open === service.id;

            return (
              <Card key={service.id}>
                <button
                  onClick={() => setOpen(expanded ? null : service.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">{service.name}</h2>
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {FREQUENCY_LABEL[service.frequency]}
                      </span>
                      {service.is_recurring ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-tone-blue-bg px-1.5 py-0.5 text-[11px] text-tone-blue-fg"
                          title="A new engagement is opened for the next period automatically"
                        >
                          <RefreshCw className="size-2.5" aria-hidden />
                          Recurring
                        </span>
                      ) : null}
                    </div>
                    {service.description ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {service.description}
                      </p>
                    ) : null}
                  </div>

                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-subtle-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>

                {expanded ? <Templates serviceTypeId={service.id} /> : null}
              </Card>
            );
          })}
        </div>
      )}

      {creating ? <NewServiceDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

/**
 * The templates behind a service.
 *
 * These are what the worker turns into tasks when an engagement opens: one
 * task per template, due `default_due_days` after the period starts.
 */
function Templates({ serviceTypeId }: { serviceTypeId: number }) {
  const query = useTemplates(serviceTypeId);

  if (query.isPending) {
    return (
      <div className="space-y-1.5 border-t border-border p-4">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const rows = query.data.results;

  if (rows.length === 0) {
    return (
      <p className="border-t border-border px-4 py-6 text-center text-xs text-subtle-foreground">
        This service has no task templates, so its engagements generate no tasks.
      </p>
    );
  }

  return (
    <ol className="border-t border-border">
      {rows.map((template) => (
        <li
          key={template.id}
          className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0"
        >
          <span className="tabular grid size-5 shrink-0 place-items-center rounded bg-surface-hover text-[10px] font-semibold text-muted-foreground">
            {template.sequence}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{template.title}</span>
          <span className="tabular shrink-0 text-xs text-subtle-foreground">
            due +{template.default_due_days}d
          </span>
        </li>
      ))}
    </ol>
  );
}

function NewServiceDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateService();
  const toast = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");

  const submit = async () => {
    try {
      await create.mutateAsync({ name, description, frequency });
      toast.success("Service created.");
      onClose();
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="New service"
      description="Its frequency decides what periods its engagements can cover."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            Create service
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="service-name">
          <Input
            id="service-name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Description" htmlFor="service-description">
          <Textarea
            id="service-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field
          label="Frequency"
          htmlFor="service-frequency"
          hint={
            frequency === "ONE_TIME"
              ? "One-off services do not roll into a next period."
              : "Recurring: the worker opens the next period automatically."
          }
        >
          <Select
            id="service-frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as Frequency)}
          >
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((option) => (
              <option key={option} value={option}>
                {FREQUENCY_LABEL[option]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
