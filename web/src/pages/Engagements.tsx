import { Briefcase, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";

import { useClients, useEngagements, useServices, useUserLookup } from "@/api/queries";
import type { EngagementStatus, Frequency } from "@/api/types";
import { useCurrentUser } from "@/auth/AuthProvider";
import { NewEngagementDialog } from "@/components/engagements/NewEngagementDialog";
import { PageHeader } from "@/components/primitives/PageHeader";
import { EmptyState, ErrorState } from "@/components/primitives/States";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatPeriod } from "@/lib/dates";
import { canManage, displayName } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  ONE_TIME: "One-off",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

const STATUS_TONE: Record<EngagementStatus, string> = {
  ACTIVE: "bg-tone-blue-bg text-tone-blue-fg ring-tone-blue-ring",
  COMPLETED: "bg-tone-emerald-bg text-tone-emerald-fg ring-tone-emerald-ring",
  CANCELLED: "bg-tone-slate-bg text-tone-slate-fg ring-tone-slate-ring",
};

export function Engagements() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();

  const clientFilter = Number(params.get("client")) || undefined;
  const serviceFilter = Number(params.get("service")) || undefined;
  const statusFilter = (params.get("status") as EngagementStatus | null) ?? undefined;

  const query = useEngagements({
    ...(clientFilter ? { client: clientFilter } : {}),
    ...(serviceFilter ? { service_type: serviceFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  const { data: clients } = useClients();
  const { data: services } = useServices();
  const { lookup } = useUserLookup();

  const dialogOpen = params.get("new") === "1";
  const setDialog = (open: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (open) next.set("new", "1");
        else next.delete("new");
        return next;
      },
      { replace: true },
    );

  const patch = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const rows = query.data?.results ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Engagements"
        description="A client, a service and the period it covers."
        actions={
          canManage(user.role) ? (
            <Button variant="primary" size="md" onClick={() => setDialog(true)}>
              <Plus className="size-4" aria-hidden />
              New engagement
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter by client"
          className="h-8 w-auto min-w-44 text-xs"
          value={clientFilter ?? ""}
          onChange={(event) => patch("client", event.target.value)}
        >
          <option value="">Any client</option>
          {clients?.results.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by service"
          className="h-8 w-auto min-w-44 text-xs"
          value={serviceFilter ?? ""}
          onChange={(event) => patch("service", event.target.value)}
        >
          <option value="">Any service</option>
          {services?.results.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by status"
          className="h-8 w-auto min-w-36 text-xs"
          value={statusFilter ?? ""}
          onChange={(event) => patch("status", event.target.value)}
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>

      {query.isPending ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }, (_, row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Briefcase}
            title="No engagements"
            description="Open one and the system generates its task checklist."
            action={
              canManage(user.role) ? (
                <Button size="sm" variant="primary" onClick={() => setDialog(true)}>
                  New engagement
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/60 text-left">
                {["Client", "Service", "Frequency", "Period", "Opened by", "Status"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody>
              {rows.map((engagement) => {
                const author = lookup(engagement.created_by_id);

                return (
                  <tr
                    key={engagement.id}
                    className="border-b border-border last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-3 py-2 font-medium">
                      <Link
                        to={`/engagements/${engagement.id}`}
                        className="hover:text-primary"
                      >
                        {engagement.client_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {engagement.service_name}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {FREQUENCY_LABEL[engagement.frequency]}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 text-xs">
                      {formatPeriod(engagement.period_start, engagement.period_end)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {author ? displayName(author) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                          STATUS_TONE[engagement.status],
                        )}
                      >
                        {engagement.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewEngagementDialog open={dialogOpen} onOpenChange={setDialog} />
    </div>
  );
}
