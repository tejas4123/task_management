import { Building2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  useClients,
  useCreateClient,
  useEngagements,
  useUpdateClient,
} from "@/api/queries";
import type { Client } from "@/api/types";
import { useCurrentUser } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { isAdmin } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function Clients() {
  const user = useCurrentUser();
  const admin = isAdmin(user.role);

  const query = useClients();
  const { data: engagements } = useEngagements();
  const [params] = useSearchParams();
  const highlight = Number(params.get("highlight")) || null;

  const [editing, setEditing] = useState<Client | "new" | null>(null);

  // The engagement list is small enough to count here; a per-client count
  // endpoint would be the move if it ever stopped being.
  const countFor = (clientId: number) =>
    engagements?.results.filter((item) => item.client === clientId).length ?? 0;

  const rows = query.data?.results ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        description={
          admin
            ? "The businesses this practice files for."
            : "The businesses this practice files for. Read-only for your role."
        }
        actions={
          admin ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              New client
            </Button>
          ) : null
        }
      />

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, card) => (
            <Skeleton key={card} className="h-28 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No clients yet" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((client) => (
            <Card
              key={client.id}
              className={cn(
                "p-4 transition-colors",
                highlight === client.id && "border-primary ring-1 ring-primary",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{client.name}</h2>
                  {client.is_active ? null : (
                    <span className="mt-1 inline-block rounded bg-surface-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-subtle-foreground">
                      Inactive
                    </span>
                  )}
                </div>
                {admin ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${client.name}`}
                    onClick={() => setEditing(client)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>

              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="truncate">{client.email || "—"}</div>
                <div className="tabular">{client.phone || "—"}</div>
              </dl>

              <Link
                to={`/engagements?client=${client.id}`}
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                {countFor(client.id)} engagement{countFor(client.id) === 1 ? "" : "s"}
              </Link>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <ClientDialog
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ClientDialog({
  client,
  onClose,
}: {
  client: Client | null;
  onClose: () => void;
}) {
  const create = useCreateClient();
  const update = useUpdateClient();
  const toast = useToast();

  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    try {
      if (client) {
        await update.mutateAsync({ id: client.id, input: { name, email, phone } });
        toast.success("Client updated.");
      } else {
        await create.mutateAsync({ name, email, phone });
        toast.success("Client created.");
      }
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
      title={client ? `Edit ${client.name}` : "New client"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!name.trim()}
            onClick={() => void submit()}
          >
            {client ? "Save changes" : "Create client"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="client-name">
          <Input
            id="client-name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="client-email">
          <Input
            id="client-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="client-phone">
          <Input
            id="client-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
