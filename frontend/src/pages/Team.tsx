import { useEffect, useState, type FormEvent } from "react";

import { get, patch, post } from "../api/client";
import type { Paginated, Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorNote, Loading } from "../components/ui";
import { Icon } from "../components/Icon";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  TEAM_MEMBER: "Team member",
};

const ROLES = Object.keys(ROLE_LABEL) as Role[];

const EMPTY_FORM = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "TEAM_MEMBER" as Role,
  password: "",
  confirm_password: "",
  is_active: true,
};

type CreateForm = typeof EMPTY_FORM;
type EditForm = { email: string; first_name: string; last_name: string; role: Role; is_active: boolean };

function initials(user: User) {
  return `${user.first_name?.[0] ?? user.username[0]}${user.last_name?.[0] ?? ""}`.toUpperCase();
}

function fullName(user: User) {
  return `${user.first_name} ${user.last_name}`.trim() || user.username;
}

/**
 * The Auth Service reports field errors as `username: <message>`. The rule
 * asks for one specific sentence on the collision every admin actually hits.
 */
function readableError(message: string): string {
  if (message.toLowerCase().includes("username already exists")) {
    return "A user with this username already exists.";
  }
  return message;
}

export default function Team() {
  const { user: currentUser } = useAuth();
  const [people, setPeople] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);

  async function load() {
    // No `is_active` filter: an admin manages deactivated accounts too.
    const page = await get<Paginated<User>>("auth", "/api/v1/users/?page_size=200");
    setPeople(page.results);
  }

  useEffect(() => {
    load().catch((caught: Error) => setError(readableError(caught.message)));
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (form.password !== form.confirm_password) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { confirm_password: _confirm, ...payload } = form;
      await post("auth", "/api/v1/users/", payload);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setNotice("User created successfully.");
      await load();
    } catch (caught) {
      setError(readableError((caught as Error).message));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(person: User) {
    setError(null);
    setNotice(null);
    setEditingId(person.id);
    setEdit({
      email: person.email,
      first_name: person.first_name,
      last_name: person.last_name,
      role: person.role,
      is_active: person.is_active,
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (editingId === null || !edit) return;

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await patch("auth", `/api/v1/users/${editingId}/`, edit);
      setEditingId(null);
      setEdit(null);
      setNotice("User updated successfully.");
      await load();
    } catch (caught) {
      setError(readableError((caught as Error).message));
    } finally {
      setSubmitting(false);
    }
  }

  async function setActive(person: User, isActive: boolean) {
    setError(null);
    setNotice(null);
    try {
      // The backend refuses an admin deactivating themselves; surface its message.
      await patch("auth", `/api/v1/users/${person.id}/`, { is_active: isActive });
      setNotice(isActive ? `${fullName(person)} was reactivated.` : `${fullName(person)} was deactivated.`);
      await load();
    } catch (caught) {
      setError(readableError((caught as Error).message));
    }
  }

  const term = search.toLowerCase().trim();
  const filtered = (people ?? [])
    .filter((person) => showInactive || person.is_active)
    .filter((person) =>
      `${person.first_name} ${person.last_name} ${person.username} ${person.email}`
        .toLowerCase()
        .includes(term),
    );
  const activeCount = (people ?? []).filter((person) => person.is_active).length;

  return (
    <section className="page-section">
      <div className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Workspace directory</p>
          <h1>Team</h1>
          <p className="subtitle">People who can contribute to client work and reviews. Only administrators can add or edit them.</p>
        </div>
        <button type="button" className="primary" onClick={() => { setShowCreate((open) => !open); setEditingId(null); }}>
          <Icon name="plus" /> Create user
        </button>
      </div>

      <ErrorNote message={error} />
      {notice ? <p className="note note--ok">{notice}</p> : null}

      {showCreate ? <Card title="Create user"><form className="form-grid" onSubmit={createUser}>
        <label><span>First name</span><input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required /></label>
        <label><span>Last name</span><input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required /></label>
        <label><span>Username</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="off" required /></label>
        <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <label><span>Password</span><input type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
        <label><span>Confirm password</span><input type="password" minLength={8} autoComplete="new-password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required /></label>
        <label><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
        <label className="check-filter"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Active</label>
        <div className="form-grid__action">
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create user"}</button>
          <button className="secondary-button" type="button" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}>Cancel</button>
        </div>
      </form></Card> : null}

      {editingId !== null && edit ? <Card title="Edit user"><form className="form-grid" onSubmit={saveEdit}>
        <label><span>First name</span><input value={edit.first_name} onChange={(event) => setEdit({ ...edit, first_name: event.target.value })} required /></label>
        <label><span>Last name</span><input value={edit.last_name} onChange={(event) => setEdit({ ...edit, last_name: event.target.value })} required /></label>
        <label><span>Email</span><input type="email" value={edit.email} onChange={(event) => setEdit({ ...edit, email: event.target.value })} required /></label>
        <label><span>Role</span><select value={edit.role} onChange={(event) => setEdit({ ...edit, role: event.target.value as Role })}>{ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
        <label className="check-filter"><input type="checkbox" checked={edit.is_active} onChange={(event) => setEdit({ ...edit, is_active: event.target.checked })} />Active</label>
        <div className="form-grid__action">
          <button className="primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</button>
          <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setEdit(null); }}>Cancel</button>
        </div>
      </form></Card> : null}

      <Card>
        <div className="table-toolbar">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Search people</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team" />
          </label>
          <label className="check-filter">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Show deactivated
          </label>
          {people ? <span className="table-count">{filtered.length} shown · {activeCount} active</span> : null}
        </div>

        {people === null ? <Loading /> : filtered.length === 0 ? <Empty>No people match that search.</Empty> : (
          <div className="table-wrap">
            <table className="table directory-table">
              <thead><tr><th>Member</th><th>Role</th><th>Username</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {filtered.map((person) => (
                  <tr key={person.id} className={person.is_active ? "" : "row--muted"}>
                    <td><span className="person-cell"><span className="avatar avatar--small">{initials(person)}</span><span><strong>{fullName(person)}</strong><small>{person.email || "No email added"}</small></span></span></td>
                    <td><span className={`role-badge role-badge--${person.role.toLowerCase()}`}>{ROLE_LABEL[person.role]}</span></td>
                    <td className="muted">@{person.username}</td>
                    <td>{person.is_active ? <span className="availability"><i /> Active</span> : <span className="muted">Deactivated</span>}</td>
                    <td className="row-actions">
                      <button className="text-button" type="button" onClick={() => startEdit(person)}>Edit</button>
                      {person.id === currentUser?.id ? <span className="muted">You</span> : (
                        <button className="text-button" type="button" onClick={() => void setActive(person, !person.is_active)}>
                          {person.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
