import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { get, patch, post, remove } from "../api/client";
import type { Client, Paginated } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, ConfirmDialog, EmptyState, ErrorNote, Skeleton, formatDate, useDebounced } from "../components/ui";
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/layout";
import { Icon } from "../components/Icon";

const EMPTY_FORM = { name: "", email: "", phone: "" };

export default function Clients() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [pendingDeactivation, setPendingDeactivation] = useState<Client | null>(null);
  // The backend filters by name; debouncing keeps a keystroke from being a request.
  const debouncedSearch = useDebounced(search, 300);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page_size: "200" });
    if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
    if (!showInactive) query.set("is_active", "true");

    const page = await get<Paginated<Client>>("engagement", `/api/v1/clients/?${query}`);
    setClients(page.results);
  }, [debouncedSearch, showInactive]);

  useEffect(() => {
    setClients(null);
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

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
    setSubmitting(true);
    try {
      if (editing) {
        await patch("engagement", `/api/v1/clients/${editing.id}/`, form);
        toast.success(`${form.name} has been updated.`);
      } else {
        await post("engagement", "/api/v1/clients/", form);
        toast.success(`${form.name} has been added to the client directory.`);
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

  async function deactivate(client: Client) {
    setError(null);
    try {
      // DELETE is a soft delete: the viewset flips is_active so engagements
      // that reference this client keep working.
      await remove("engagement", `/api/v1/clients/${client.id}/`);
      toast.success(`${client.name} has been deactivated.`);
      await load();
    } catch (caught) {
      toast.error((caught as Error).message);
    } finally {
      setPendingDeactivation(null);
    }
  }

  async function reactivate(client: Client) {
    setError(null);
    try {
      await patch("engagement", `/api/v1/clients/${client.id}/`, { is_active: true });
      toast.success(`${client.name} has been reactivated.`);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  const rows = clients ?? [];
  const canManage = hasRole("ADMIN");

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Directory"
        title="Clients"
        description="The organizations your team serves, with their essential contact details."
        actions={canManage ? <button className="primary" onClick={openCreate}><Icon name="plus" />New client</button> : null}
      />

      <ErrorNote message={error} />
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
        <div className="table-toolbar">
          <label className="search-field search-field--wide">
            <Icon name="search" />
            <span className="sr-only">Search clients</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client name" />
          </label>
          <label className="check-filter">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Show inactive
          </label>
          {clients ? <span className="table-count">{rows.length} clients</span> : null}
        </div>

        {clients === null ? <Skeleton variant="table" /> : rows.length === 0 ? (
          <EmptyState
            title={search ? "No clients match that search" : "No clients yet"}
            body={search
              ? "Try a different name, or clear the search to see everyone."
              : "Clients are the organizations your team delivers work for. Every engagement belongs to one."}
            action={search
              ? { onClick: () => setSearch(""), label: "Clear search" }
              : canManage ? { onClick: openCreate, label: "Add the first client" } : undefined}
          />
        ) : (
          <div className="table-wrap"><table className="table client-table"><thead><tr>
            <th>Client</th><th>Contact</th><th>Phone</th><th>Status</th><th>Added</th>
            {canManage ? <th><span className="sr-only">Actions</span></th> : null}
          </tr></thead><tbody>
            {rows.map((client) => <tr key={client.id} className={client.is_active ? "" : "row--muted"}>
              <td><Link className="task-link" to={`/clients/${client.id}`}>{client.name}</Link></td>
              <td>{client.email || <span className="muted">No email</span>}</td>
              <td>{client.phone || <span className="muted">—</span>}</td>
              <td><span className={`status-dot ${client.is_active ? "" : "status-dot--inactive"}`}>{client.is_active ? "Active" : "Inactive"}</span></td>
              <td className="muted">{client.created_at ? formatDate(client.created_at) : "—"}</td>
              {canManage ? <td className="row-actions">
                <button className="text-button" type="button" onClick={() => openEdit(client)}>Edit</button>
                {client.is_active
                  ? <button className="text-button text-button--danger" type="button" onClick={() => setPendingDeactivation(client)}>Deactivate</button>
                  : <button className="text-button" type="button" onClick={() => void reactivate(client)}>Reactivate</button>}
              </td> : null}
            </tr>)}
          </tbody></table></div>
        )}
      </Card>

      <ConfirmDialog
        open={pendingDeactivation !== null}
        title={`Deactivate ${pendingDeactivation?.name ?? "client"}?`}
        body="They stay on existing engagements and keep their history, but cannot be selected for new work. You can reactivate them at any time."
        confirmLabel="Deactivate"
        onConfirm={() => pendingDeactivation && void deactivate(pendingDeactivation)}
        onCancel={() => setPendingDeactivation(null)}
      />
    </section>
  );
}
