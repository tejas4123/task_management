import { useCallback, useEffect, useState, type FormEvent } from "react";

import { get, patch, post, remove } from "../api/client";
import type { Frequency, Paginated, ServiceType, TaskTemplate } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, ConfirmDialog, EmptyState, ErrorNote, Skeleton } from "../components/ui";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/layout";
import { Icon } from "../components/Icon";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as Frequency[];

const EMPTY_SERVICE = { name: "", description: "", frequency: "ONE_TIME" as Frequency };
const EMPTY_TEMPLATE = { title: "", description: "", default_due_days: "7" };

type ServiceForm = typeof EMPTY_SERVICE;
type TemplateForm = typeof EMPTY_TEMPLATE;

/** What the user is currently being asked to confirm deleting. */
type Pending =
  | { kind: "service"; service: ServiceType }
  | { kind: "template"; template: TaskTemplate };

export default function Services() {
  const { hasRole } = useAuth();
  const toast = useToast();

  const [services, setServices] = useState<ServiceType[] | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(EMPTY_SERVICE);
  const [editingService, setEditingService] = useState<ServiceType | null>(null);

  const [templateTarget, setTemplateTarget] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const canManage = hasRole("ADMIN");

  /** Long checklists push a card's own actions off screen, so collapse them. */
  const COLLAPSE_AFTER = 4;

  function toggleExpanded(serviceId: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }

  const load = useCallback(async () => {
    const [servicePage, templatePage] = await Promise.all([
      get<Paginated<ServiceType>>("engagement", "/api/v1/services/?page_size=200"),
      get<Paginated<TaskTemplate>>("engagement", "/api/v1/templates/?page_size=200"),
    ]);
    setServices(servicePage.results);
    setTemplates(templatePage.results);
  }, []);

  useEffect(() => {
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setError(null);
    setSubmitting(true);
    try {
      await action();
      await load();
      toast.success(success);
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateService() {
    setEditingService(null);
    setServiceForm(EMPTY_SERVICE);
    setShowServiceForm(true);
    setTemplateTarget(null);
  }

  function openEditService(service: ServiceType) {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      description: service.description,
      frequency: service.frequency,
    });
    setShowServiceForm(true);
    setTemplateTarget(null);
  }

  async function saveService(event: FormEvent) {
    event.preventDefault();
    const target = editingService;

    await run(async () => {
      if (target) {
        await patch("engagement", `/api/v1/services/${target.id}/`, serviceForm);
      } else {
        await post("engagement", "/api/v1/services/", serviceForm);
      }
      setShowServiceForm(false);
      setEditingService(null);
      setServiceForm(EMPTY_SERVICE);
    }, target ? "The service has been updated." : "The service has been added to the catalogue.");
  }

  function openCreateTemplate(serviceId: number) {
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE);
    setTemplateTarget(serviceId);
    setShowServiceForm(false);
  }

  function openEditTemplate(template: TaskTemplate) {
    setEditingTemplate(template);
    setTemplateForm({
      title: template.title,
      description: template.description,
      default_due_days: String(template.default_due_days),
    });
    setTemplateTarget(template.service_type);
    setShowServiceForm(false);
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (templateTarget === null) return;

    const target = editingTemplate;
    const body = {
      title: templateForm.title,
      description: templateForm.description,
      default_due_days: Number(templateForm.default_due_days),
    };

    await run(async () => {
      if (target) {
        await patch("engagement", `/api/v1/templates/${target.id}/`, body);
      } else {
        // UNIQUE(service_type, sequence): take the next free slot rather than
        // asking the user to know what is already used.
        const used = templates
          .filter((item) => item.service_type === templateTarget)
          .map((item) => item.sequence);
        const sequence = used.length ? Math.max(...used) + 1 : 1;

        await post("engagement", "/api/v1/templates/", {
          ...body,
          service_type: templateTarget,
          sequence,
        });
      }
      setTemplateTarget(null);
      setEditingTemplate(null);
      setTemplateForm(EMPTY_TEMPLATE);
    }, target ? "The task template has been updated." : "The task template has been added.");
  }

  async function confirmDelete() {
    const target = pending;
    setPending(null);
    if (!target) return;

    if (target.kind === "service") {
      // A service still referenced by engagements answers 409; the message is
      // shown as-is rather than pretending the delete is always available.
      await run(
        () => remove("engagement", `/api/v1/services/${target.service.id}/`),
        `${target.service.name} has been removed from the catalogue.`,
      );
      return;
    }

    await run(
      () => remove("engagement", `/api/v1/templates/${target.template.id}/`),
      "The task template has been removed.",
    );
  }

  const targetService = services?.find((service) => service.id === templateTarget);

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Delivery standards"
        title="Service catalogue"
        description="Reusable services and the task checklists each engagement begins with."
        actions={canManage ? (
          <button className="primary" onClick={openCreateService}>
            <Icon name="plus" />
            New service
          </button>
        ) : null}
      />

      <ErrorNote message={error} />

      {showServiceForm ? (
        <Card title={editingService ? `Edit ${editingService.name}` : "Add service type"}>
          <form className="form-grid" onSubmit={saveService}>
            <label>
              <span>Service name</span>
              <input
                value={serviceForm.name}
                onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })}
                placeholder="e.g. Quarterly VAT compliance"
                required
              />
            </label>
            <label>
              <span>Frequency</span>
              <select
                value={serviceForm.frequency}
                onChange={(event) =>
                  setServiceForm({ ...serviceForm, frequency: event.target.value as Frequency })
                }
              >
                {FREQUENCIES.map((frequency) => (
                  <option value={frequency} key={frequency}>
                    {FREQUENCY_LABELS[frequency]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-grid__wide">
              <span>Description</span>
              <input
                value={serviceForm.description}
                onChange={(event) =>
                  setServiceForm({ ...serviceForm, description: event.target.value })
                }
                placeholder="A short explanation of what this service covers"
              />
            </label>
            <div className="form-grid__action">
              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editingService ? "Save changes" : "Add service"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowServiceForm(false);
                  setEditingService(null);
                }}
              >
                Cancel
              </button>
              <span>Recurring services generate the next period automatically.</span>
            </div>
          </form>
        </Card>
      ) : null}

      {templateTarget !== null ? (
        <Card
          title={
            editingTemplate
              ? `Edit template in ${targetService?.name ?? "service"}`
              : `Add template to ${targetService?.name ?? "service"}`
          }
        >
          <form className="form-grid" onSubmit={saveTemplate}>
            <label>
              <span>Task title</span>
              <input
                value={templateForm.title}
                onChange={(event) => setTemplateForm({ ...templateForm, title: event.target.value })}
                placeholder="e.g. Verify purchase invoices"
                required
              />
            </label>
            <label>
              <span>Due after start</span>
              <input
                type="number"
                min="0"
                value={templateForm.default_due_days}
                onChange={(event) =>
                  setTemplateForm({ ...templateForm, default_due_days: event.target.value })
                }
                required
              />
            </label>
            <label className="form-grid__wide">
              <span>
                Instructions <em>(optional)</em>
              </span>
              <input
                value={templateForm.description}
                onChange={(event) =>
                  setTemplateForm({ ...templateForm, description: event.target.value })
                }
                placeholder="Give the assignee any helpful context"
              />
            </label>
            <div className="form-grid__action">
              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editingTemplate ? "Save changes" : "Add template"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setTemplateTarget(null);
                  setEditingTemplate(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {services === null ? (
        <Card>
          <Skeleton variant="panel" />
        </Card>
      ) : services.length === 0 ? (
        <Card>
          <EmptyState
            title="No services configured"
            body="A service defines the checklist every engagement of that type starts with. Add one to begin."
            action={canManage ? { onClick: openCreateService, label: "Add a service" } : undefined}
          />
        </Card>
      ) : (
        <div className="service-list">
          {services.map((service) => {
            const checklist = templates
              .filter((template) => template.service_type === service.id)
              .sort((a, b) => a.sequence - b.sequence);

            const isExpanded = expanded.has(service.id);
            const hidden = Math.max(0, checklist.length - COLLAPSE_AFTER);
            const visible = isExpanded ? checklist : checklist.slice(0, COLLAPSE_AFTER);

            return (
              <Card key={service.id} title={service.name}>
                <div className="service-card__body">
                  <div className="service-card__meta">
                    <span>{FREQUENCY_LABELS[service.frequency]}</span>
                    <i />
                    <span>{service.is_recurring ? "Recurring" : "One-off"}</span>
                    <i />
                    <span>
                      {checklist.length} {checklist.length === 1 ? "template" : "templates"}
                    </span>
                    {canManage ? (
                      <span className="service-card__admin">
                        <button className="text-button" type="button" onClick={() => openEditService(service)}>
                          Edit
                        </button>
                        <button
                          className="text-button text-button--danger"
                          type="button"
                          onClick={() => setPending({ kind: "service", service })}
                        >
                          Delete
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <p>{service.description || "No service description has been added."}</p>

                  {checklist.length ? (
                    <>
                    <ol className="template-list">
                      {visible.map((template) => (
                        <li key={template.id}>
                          <span className="template-list__number">
                            {String(template.sequence).padStart(2, "0")}
                          </span>
                          <span className="template-list__copy">
                            <strong>{template.title}</strong>
                            <small>
                              Due {template.default_due_days} days after the service period begins
                            </small>
                          </span>
                          {canManage ? (
                            <span className="template-list__actions">
                              <button
                                className="text-button"
                                type="button"
                                onClick={() => openEditTemplate(template)}
                              >
                                Edit
                              </button>
                              <button
                                className="text-button text-button--danger"
                                type="button"
                                onClick={() => setPending({ kind: "template", template })}
                              >
                                Delete
                              </button>
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                    {hidden > 0 ? (
                      <button
                        type="button"
                        className="template-more"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(service.id)}
                      >
                        <Icon name="chevron-right" />
                        {isExpanded ? "Show fewer" : `Show all ${checklist.length} templates`}
                      </button>
                    ) : null}
                    </>
                  ) : (
                    <EmptyState
                      title="No task templates yet"
                      body="Engagements for this service will generate no tasks until it has at least one template."
                      action={
                        canManage
                          ? { onClick: () => openCreateTemplate(service.id), label: "Add the first template" }
                          : undefined
                      }
                    />
                  )}
                </div>
                {canManage ? (
                  <button className="card-footer-link" onClick={() => openCreateTemplate(service.id)}>
                    <Icon name="plus" />
                    Add task template
                  </button>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === "service"
            ? `Delete ${pending.service.name}?`
            : pending?.kind === "template"
              ? `Delete "${pending.template.title}"?`
              : ""
        }
        body={
          pending?.kind === "service"
            ? "A service already used by an engagement cannot be deleted - you will be told if that is the case."
            : "Tasks already generated from this template keep working. Future engagements will no longer include it."
        }
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
