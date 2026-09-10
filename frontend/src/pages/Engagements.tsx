import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { get, post } from "../api/client";
import type { Client, Engagement, Paginated, ServiceType } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorNote, Loading, formatDate } from "../components/ui";
import { Icon } from "../components/Icon";

const EMPTY_FORM = { client: "", service_type: "", period_start: "", period_end: "" };

export default function Engagements() {
  const { hasRole } = useAuth();
  const [engagements, setEngagements] = useState<Engagement[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const page = await get<Paginated<Engagement>>("engagement", "/api/v1/engagements/?page_size=100");
    setEngagements(page.results);
  }

  useEffect(() => {
    load().catch((caught: Error) => setError(caught.message));
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
    setNotice(null);
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
      setNotice("Engagement created. Its task checklist is now being generated in the background.");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = useMemo(() => (engagements ?? []).filter((item) =>
    `${item.client_name} ${item.service_name} ${item.status}`.toLowerCase().includes(search.toLowerCase()),
  ), [engagements, search]);
  const canCreate = hasRole("ADMIN", "MANAGER");

  return (
    <section className="page-section">
      <div className="page-heading page-heading--split">
        <div><p className="eyebrow">Client work</p><h1>Engagements</h1><p className="subtitle">Active service periods, their scope, and the work they generate.</p></div>
        {canCreate ? <button className="primary" onClick={() => setShowCreate((open) => !open)}><Icon name={showCreate ? "close" : "plus"} />{showCreate ? "Close" : "New engagement"}</button> : null}
      </div>

      <ErrorNote message={error} />
      {notice ? <p className="note note--ok">{notice}</p> : null}

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
        <div className="table-toolbar">
          <label className="search-field search-field--wide"><Icon name="search" /><span className="sr-only">Search engagements</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client or service" /></label>
          {engagements ? <span className="table-count">{filtered.length} engagements</span> : null}
        </div>
        {engagements === null ? <Loading /> : filtered.length === 0 ? <Empty>{search ? "No engagements match that search." : "No engagements yet."}</Empty> : (
          <div className="table-wrap"><table className="table engagement-table"><thead><tr><th>Client</th><th>Service</th><th>Service period</th><th>Status</th><th>Created</th><th><span className="sr-only">Tasks</span></th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id}>
              <td><strong>{item.client_name}</strong></td>
              <td><span className="engagement-cell"><strong>{item.service_name}</strong><small>{item.frequency.replaceAll("_", " ").toLowerCase()}</small></span></td>
              <td><span className="period-cell"><Icon name="calendar" />{formatDate(item.period_start)} <span>–</span> {formatDate(item.period_end)}</span></td>
              <td><span className={`engagement-status engagement-status--${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></td>
              <td className="muted">{item.created_at ? formatDate(item.created_at) : "—"}</td>
              <td><Link to={`/tasks?engagement=${item.id}`} className="row-action" aria-label={`View tasks for ${item.client_name}`}><Icon name="chevron-right" /></Link></td>
            </tr>)}
          </tbody></table></div>
        )}
      </Card>
    </section>
  );
}
