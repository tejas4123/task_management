import { useEffect, useState } from "react";

import { ApiError } from "@/api";
import { useClients, useCreateEngagement, useServices } from "@/api/queries";
import type { Frequency } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

import { PeriodPicker, defaultPeriod, type Period } from "./PeriodPicker";

const FREQUENCY_LABEL: Record<Frequency, string> = {
  ONE_TIME: "One-off",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

/**
 * Opening an engagement.
 *
 * The interesting failure is the duplicate: the same client, service and period
 * already exists, and the engagement service answers 409 from a UNIQUE
 * constraint rather than a prior `exists()` check. It is shown inline, next to
 * the fields that caused it, rather than as a toast that scrolls away.
 */
export function NewEngagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: clients } = useClients({ is_active: true });
  const { data: services } = useServices();
  const create = useCreateEngagement();
  const toast = useToast();

  const [clientId, setClientId] = useState<number | "">("");
  const [serviceId, setServiceId] = useState<number | "">("");
  const [period, setPeriod] = useState<Period>(() =>
    defaultPeriod("MONTHLY", new Date()),
  );
  const [conflict, setConflict] = useState<string | null>(null);

  const service = services?.results.find((candidate) => candidate.id === serviceId);
  const frequency = service?.frequency ?? "MONTHLY";

  // Changing the service changes the shape of a valid period, so re-seed it.
  useEffect(() => {
    if (service) setPeriod(defaultPeriod(service.frequency, new Date()));
  }, [service]);

  useEffect(() => {
    if (!open) {
      setClientId("");
      setServiceId("");
      setConflict(null);
    }
  }, [open]);

  const submit = async () => {
    if (clientId === "" || serviceId === "") return;
    setConflict(null);

    try {
      await create.mutateAsync({
        client: clientId,
        service_type: serviceId,
        period_start: period.period_start,
        period_end: period.period_end,
      });

      toast.success("Engagement created. Its tasks are being generated.");
      onOpenChange(false);
    } catch (cause) {
      // 409 and 400 are about these fields; anything else is a real failure.
      if (cause instanceof ApiError && (cause.isConflict || cause.status === 400)) {
        setConflict(cause.message);
      } else {
        toast.fromError(cause);
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New engagement"
      description="A client, a service and the period it covers."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={clientId === "" || serviceId === ""}
            onClick={() => void submit()}
          >
            Create engagement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client" htmlFor="engagement-client">
          <Select
            id="engagement-client"
            value={clientId}
            onChange={(event) => setClientId(Number(event.target.value) || "")}
          >
            <option value="">Select a client…</option>
            {clients?.results.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Service"
          htmlFor="engagement-service"
          hint={service ? `${FREQUENCY_LABEL[service.frequency]} · ${service.description}` : undefined}
        >
          <Select
            id="engagement-service"
            value={serviceId}
            onChange={(event) => setServiceId(Number(event.target.value) || "")}
          >
            <option value="">Select a service…</option>
            {services?.results.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>

        {serviceId === "" ? (
          <p className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-subtle-foreground">
            Pick a service to choose its period.
          </p>
        ) : (
          <PeriodPicker frequency={frequency} value={period} onChange={setPeriod} />
        )}

        {conflict ? (
          <p
            role="alert"
            className="rounded border border-danger/40 bg-danger-subtle px-3 py-2 text-xs text-danger"
          >
            {conflict}
          </p>
        ) : null}

        <p className="text-xs text-subtle-foreground">
          Creating the engagement publishes <code>ENGAGEMENT_CREATED</code>; the worker
          generates one task per template for the service.
        </p>
      </div>
    </Dialog>
  );
}
