import { useEffect, useState, type FormEvent } from "react";

import { get, post } from "../api/client";
import type { Frequency, Paginated, ServiceType, TaskTemplate } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorNote, Loading } from "../components/ui";
import { Icon } from "../components/Icon";

const FREQUENCY_LABELS: Record<Frequency, string> = { ONE_TIME: "One-time", MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };
const EMPTY_SERVICE = { name: "", description: "", frequency: "ONE_TIME" as Frequency };

export default function Services() {
  const { hasRole } = useAuth();
  const [services, setServices] = useState<ServiceType[] | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [templateTarget, setTemplateTarget] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState({ title: "", description: "", default_due_days: "7" });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [servicePage, templatePage] = await Promise.all([
      get<Paginated<ServiceType>>("engagement", "/api/v1/services/?page_size=200"),
      get<Paginated<TaskTemplate>>("engagement", "/api/v1/templates/?page_size=200"),
    ]);
    setServices(servicePage.results);
    setTemplates(templatePage.results);
  }

  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  async function createService(event: FormEvent) {
    event.preventDefault();
    setError(null); setNotice(null); setSubmitting(true);
    try {
      await post("engagement", "/api/v1/services/", serviceForm);
      setServiceForm(EMPTY_SERVICE); setShowServiceForm(false);
      setNotice("The service has been added to the catalogue.");
      await load();
    } catch (caught) { setError((caught as Error).message); } finally { setSubmitting(false); }
  }

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    if (templateTarget === null) return;
    const usedSequences = templates.filter((item) => item.service_type === templateTarget).map((item) => item.sequence);
    const nextSequence = usedSequences.length ? Math.max(...usedSequences) + 1 : 1;
    setError(null); setNotice(null); setSubmitting(true);
    try {
      await post("engagement", "/api/v1/templates/", { service_type: templateTarget, title: templateForm.title, description: templateForm.description, default_due_days: Number(templateForm.default_due_days), sequence: nextSequence });
      setTemplateForm({ title: "", description: "", default_due_days: "7" }); setTemplateTarget(null);
      setNotice("The task template has been added to the service checklist.");
      await load();
    } catch (caught) { setError((caught as Error).message); } finally { setSubmitting(false); }
  }

  const canManage = hasRole("ADMIN");
  const targetService = services?.find((service) => service.id === templateTarget);

  return (
    <section className="page-section">
      <div className="page-heading page-heading--split">
        <div><p className="eyebrow">Delivery standards</p><h1>Service catalogue</h1><p className="subtitle">Reusable services and the task checklists each engagement begins with.</p></div>
        {canManage ? <button className="primary" onClick={() => setShowServiceForm((open) => !open)}><Icon name={showServiceForm ? "close" : "plus"} />{showServiceForm ? "Close" : "New service"}</button> : null}
      </div>
      <ErrorNote message={error} />
      {notice ? <p className="note note--ok">{notice}</p> : null}

      {showServiceForm ? <Card title="Add service type"><form className="form-grid" onSubmit={createService}>
        <label><span>Service name</span><input value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} placeholder="e.g. Quarterly VAT compliance" required /></label>
        <label><span>Frequency</span><select value={serviceForm.frequency} onChange={(event) => setServiceForm({ ...serviceForm, frequency: event.target.value as Frequency })}>{(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((frequency) => <option value={frequency} key={frequency}>{FREQUENCY_LABELS[frequency]}</option>)}</select></label>
        <label style={{ gridColumn: "1 / -1" }}><span>Description</span><input value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} placeholder="A short explanation of what this service covers" /></label>
        <div className="form-grid__action"><button className="primary" type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add service"}</button></div>
      </form></Card> : null}

      {templateTarget !== null ? <Card title={`Add template to ${targetService?.name ?? "service"}`}><form className="form-grid" onSubmit={createTemplate}>
        <label><span>Task title</span><input value={templateForm.title} onChange={(event) => setTemplateForm({ ...templateForm, title: event.target.value })} placeholder="e.g. Verify purchase invoices" required /></label>
        <label><span>Due after start</span><input type="number" min="0" value={templateForm.default_due_days} onChange={(event) => setTemplateForm({ ...templateForm, default_due_days: event.target.value })} required /></label>
        <label style={{ gridColumn: "1 / -1" }}><span>Instructions <em>(optional)</em></span><input value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} placeholder="Give the assignee any helpful context" /></label>
        <div className="form-grid__action"><button className="primary" type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add template"}</button><button className="secondary-button" type="button" onClick={() => setTemplateTarget(null)}>Cancel</button></div>
      </form></Card> : null}

      {services === null ? <Loading /> : services.length === 0 ? <Card><Empty>No services configured.</Empty></Card> : (
        <div className="service-list">{services.map((service) => {
          const checklist = templates.filter((template) => template.service_type === service.id).sort((a, b) => a.sequence - b.sequence);
          return <Card key={service.id} title={service.name}>
            <div className="service-card__body"><div className="service-card__meta"><span>{FREQUENCY_LABELS[service.frequency]}</span><i /> <span>{service.is_recurring ? "Recurring" : "One-off"}</span><i /><span>{checklist.length} templates</span></div><p>{service.description || "No service description has been added."}</p>
              {checklist.length ? <ol className="template-list">{checklist.map((template) => <li key={template.id}><span className="template-list__number">{String(template.sequence).padStart(2, "0")}</span><span className="template-list__copy"><strong>{template.title}</strong><small>Due {template.default_due_days} days after the service period begins</small></span></li>)}</ol> : <p className="empty-copy">No task templates yet.</p>}
            </div>
            {canManage ? <button className="card-footer-link" onClick={() => setTemplateTarget(service.id)}><Icon name="plus" />Add task template</button> : null}
          </Card>;
        })}</div>
      )}
    </section>
  );
}
