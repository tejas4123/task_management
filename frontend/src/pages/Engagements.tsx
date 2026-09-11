import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { get, post } from "../api/client";
import type { Client, Engagement, EngagementStatus, Paginated, ServiceType } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, EmptyState, ErrorNote, Skeleton, formatDate, useDebounced } from "../components/ui";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/layout";
import { Icon } from "../components/Icon";

const EMPTY_FORM = { client: "", service_type: "", period_start: "", period_end: "" };

export default function Engagements() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [engagements, setEngagements] = useState<Engagement[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // client / service_type / status are backend filters; search stays local
    // because the engagement list has no text-search parameter.
    const query = new URLSearchParams({ page_size: "100" });
    if (clientFilter) query.set("client", clientFilter);
    if (serviceFilter) query.set("service_type", serviceFilter);
    if (statusFilter) query.set("status", statusFilter);

    const page = await get<Paginated<Engagement>>("engagement", `/api/v1/engagements/?${query}`);
    setEngagements(page.results);
  }, [clientFilter, serviceFilter, statusFilter]);

  useEffect(() => {
    setEngagements(null);
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  useEffect(() => {
    if (!hasRole("ADMIN", "MANAGER")) return;
    Promise.all([
      get<Paginated<Client>>("engagement", "/api/v1/clients/?is_active=true&page_size=200"),
      get<Paginated<ServiceType>>("engagement", "/api/v1/services/?page_size=200"),
    ]).then(([clientPage, servicePage]) => {
      setClients(clientPage.results);
      setServices(servicePage.results);
    }).catch(() => undefined);
  }, [hasRole]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.period_end < form.period_start) {
      setError("The period end must be on or after the period start.");
      return;
    }
    setSubmitting(true);
    try {
      await post("engagement", "/api/v1/engagements/", {
        client: Number(form.client), service_type: Number(form.service_type), period_start: form.period_start, period_end: form.period_end,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      toast.success("Engagement created. Its task checklist is being generated in the background.");
      await load();
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const term = useDebounced(search, 250).toLowerCase().trim();
  const filtered = (engagements ?? []).filter((item) =>
    `${item.client_name} ${item.service_name}`.toLowerCase().includes(term),
  );
  const canCreate = hasRole("ADMIN", "MANAGER");
  const filterCount = [clientFilter, serviceFilter, statusFilter, term].filter(Boolean).length;

  function clearFilters() {
    setClientFilter("");
    setServiceFilter("");
    setStatusFilter("");
    setSearch("");
  }

  return (
    <section className="page-section">


      <PageHeader
        eyebrow="Client work"
        title="Engagements"
        description="Active service periods, their scope, and the work they generate."
        actions={canCreate ? <button className="primary" onClick={() => setShowCreate((open) => !open)}><Icon name={showCreate ? "close" : "plus"} />{showCreate ? "Close" : "New engagement"}</button> : null}
      />

      <ErrorNote message={error} />

      {showCreate ? <Card title="Create engagement">
        <form className="form-grid" onSubmit={handleCreate}>
          <label><span>Client</span><select value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} required><option value="">Choose a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label><span>Service type</span><select value={form.service_type} onChange={(event) => setForm({ ...form, service_type: event.target.value })} required><option value="">Choose a service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label><span>Period start</span><input type="date" value={form.period_start} onChange={(event) => setForm({ ...form, period_start: event.target.value })} required /></label>
          <label><span>Period end</span><input type="date" value={form.period_end} onChange={(event) => setForm({ ...form, period_end: event.target.value })} required /></label>
          <div className="form-grid__action"><button className="primary" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create engagement"}</button><span>Tasks will be created from the service template.</span></div>
        </form>
      </Card> : null}

      <Card>
        <div className="filter-bar">
          <label className="search-field search-field--wide"><Icon name="search" /><span className="sr-only">Search engagements</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client or service" /></label>
          <label className="select-field"><span>Client</span><select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="select-field"><span>Service</span><select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="">All services</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label className="select-field"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as EngagementStatus | "")}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
          {filterCount > 0 ? <button className="text-button" type="button" onClick={clearFilters}>Clear filters</button> : null}
          {engagements ? <span className="table-count">{filtered.length} shown</span> : null}
        </div>
        {engagements === null ? <Skeleton variant="table" /> : filtered.length === 0 ? (
          <EmptyState
            title={filterCount ? "No engagements match these filters" : "No engagements yet"}
            body={filterCount
              ? "Try widening the filters, or clear them to see everything."
              : "An engagement covers one service for one client over one reporting period, and generates that period's task checklist."}
            action={filterCount
              ? { onClick: clearFilters, label: "Clear filters" }
              : canCreate ? { onClick: () => setShowCreate(true), label: "Create the first engagement" } : undefined}
          />
        ) : (
          <div className="table-wrap"><table className="table engagement-table"><thead><tr><th>Client</th><th>Service</th><th>Service period</th><th>Status</th><th>Created</th><th><span className="sr-only">Tasks</span></th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id}>
              <td><Link className="task-link" to={`/engagements/${item.id}`}>{item.client_name}</Link></td>
              <td><span className="engagement-cell"><strong>{item.service_name}</strong><small>{item.frequency.replaceAll("_", " ").toLowerCase()}</small></span></td>
              <td><span className="period-cell"><Icon name="calendar" />{formatDate(item.period_start)} <span>–</span> {formatDate(item.period_end)}</span></td>
              <td><span className={`engagement-status engagement-status--${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></td>
              <td className="muted">{item.created_at ? formatDate(item.created_at) : "—"}</td>
              <td><Link to={`/engagements/${item.id}`} className="row-action" aria-label={`Open ${item.client_name} engagement`}><Icon name="chevron-right" /></Link></td>
            </tr>)}
          </tbody></table></div>
        )}
      </Card>
    </section>
  );
}
