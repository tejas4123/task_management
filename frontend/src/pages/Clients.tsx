import { useEffect, useMemo, useState, type FormEvent } from "react";

import { get, patch, post } from "../api/client";
import type { Client, Paginated } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorNote, Loading, formatDate } from "../components/ui";
import { Icon } from "../components/Icon";

const EMPTY_FORM = { name: "", email: "", phone: "" };

export default function Clients() {
  const { hasRole } = useAuth();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const page = await get<Paginated<Client>>("engagement", "/api/v1/clients/?page_size=200");
    setClients(page.results);
  }

  useEffect(() => { load().catch((caught: Error) => setError(caught.message)); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setForm({ name: client.name, email: client.email, phone: client.phone });
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (editing) {
        await patch("engagement", `/api/v1/clients/${editing.id}/`, form);
        setNotice(`${form.name} has been updated.`);
      } else {
        await post("engagement", "/api/v1/clients/", form);
        setNotice(`${form.name} has been added to the client directory.`);
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = useMemo(() => (clients ?? []).filter((client) =>
    `${client.name} ${client.email} ${client.phone}`.toLowerCase().includes(search.toLowerCase()),
  ), [clients, search]);
  const canManage = hasRole("ADMIN");

  return (
    <section className="page-section">
      <div className="page-heading page-heading--split">
        <div><p className="eyebrow">Directory</p><h1>Clients</h1><p className="subtitle">The organizations your team serves, with their essential contact details.</p></div>
        {canManage ? <button className="primary" onClick={openCreate}><Icon name="plus" />New client</button> : null}
      </div>

      <ErrorNote message={error} />
      {notice ? <p className="note note--ok">{notice}</p> : null}
      {showForm ? <Card title={editing ? "Edit client" : "Add client"}>
        <form className="inline-form client-form" onSubmit={handleSubmit}>
          <label><span>Client name</span><input placeholder="e.g. Northstar Labs" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label><span>Email</span><input placeholder="contact@company.com" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label><span>Phone</span><input placeholder="Phone number" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save changes" : "Add client"}</button>
          <button className="secondary-button" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
        </form>
      </Card> : null}

      <Card>
        <div className="table-toolbar"><label className="search-field search-field--wide"><Icon name="search" /><span className="sr-only">Search clients</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client or contact" /></label>{clients ? <span className="table-count">{filtered.length} clients</span> : null}</div>
        {clients === null ? <Loading /> : filtered.length === 0 ? <Empty>{search ? "No clients match that search." : "No clients yet."}</Empty> : (
          <div className="table-wrap"><table className="table client-table"><thead><tr><th>Client</th><th>Contact</th><th>Phone</th><th>Status</th><th>Added</th>{canManage ? <th><span className="sr-only">Edit</span></th> : null}</tr></thead><tbody>
            {filtered.map((client) => <tr key={client.id}>
              <td><strong>{client.name}</strong></td><td>{client.email || <span className="muted">No email</span>}</td><td>{client.phone || <span className="muted">—</span>}</td><td><span className={`status-dot ${client.is_active ? "" : "status-dot--inactive"}`}>{client.is_active ? "Active" : "Inactive"}</span></td><td className="muted">{client.created_at ? formatDate(client.created_at) : "—"}</td>{canManage ? <td><button className="text-button" onClick={() => openEdit(client)}>Edit</button></td> : null}
            </tr>)}
          </tbody></table></div>
        )}
      </Card>
    </section>
  );
}
