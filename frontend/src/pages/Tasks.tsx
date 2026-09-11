import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { get } from "../api/client";
import type { Engagement, Paginated, Task, TaskStatus, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, EmptyState, ErrorNote, STATUS_LABELS, Skeleton, StatusBadge, formatDate, isOverdue } from "../components/ui";
import { CreateTaskForm } from "../components/CreateTaskForm";
import { useToast } from "../components/Toast";
import { Chip, PageHeader } from "../components/layout";
import { Icon } from "../components/Icon";

const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];
type SortKey = "title" | "due_date" | "status";

function personName(person: User | undefined) {
  if (!person) return "Unassigned";
  return `${person.first_name} ${person.last_name}`.trim() || person.username;
}

export default function Tasks() {
  const { user, hasRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [people, setPeople] = useState<User[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<{ id: number; title: string } | null>(null);

  const status = params.get("status") ?? "";
  const mine = params.get("mine") === "true";
  const overdueOnly = params.get("overdue") === "true";
  const dueToday = params.get("due") === "today";
  const assignee = params.get("assignee") ?? "";
  const engagement = params.get("engagement") ?? "";
  const search = params.get("search") ?? "";
  const sort = (params.get("sort") as SortKey | null) ?? "due_date";
  const direction = params.get("direction") === "desc" ? "desc" : "asc";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (mine) query.set("mine", "true");
    if (assignee) query.set("assigned_to_id", assignee);
    if (engagement) query.set("engagement_id", engagement);

    const today = new Date().toISOString().slice(0, 10);
    if (overdueOnly) query.set("due_before", today);
    if (dueToday) {
      query.set("due_before", today);
      query.set("due_after", today);
    }

    try {
      const page = await get<Paginated<Task>>("task", `/api/v1/tasks/?${query.toString()}`);
      setTasks(page.results);
      setNextCursor(page.next);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [assignee, dueToday, engagement, mine, overdueOnly, status]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    Promise.all([
      get<Paginated<User>>("auth", "/api/v1/users/?is_active=true&page_size=200"),
      get<Paginated<Engagement>>("engagement", "/api/v1/engagements/?page_size=200"),
    ]).then(([userPage, engagementPage]) => {
      setPeople(userPage.results);
      setEngagements(engagementPage.results);
    }).catch(() => {
      // Task data remains useful even if supporting display labels cannot load.
    });
  }, []);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await get<Paginated<Task>>("task", nextCursor.replace(/^https?:\/\/[^/]+/, ""));
      setTasks((current) => [...current, ...page.results]);
      setNextCursor(page.next);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreated(task: Task) {
    setShowCreate(false);
    setNotice({ id: task.id, title: task.title });
    toast.success(`Created "${task.title}".`);
    // Re-read rather than splice the new task in: the active filters decide
    // whether it belongs in this view, and that logic stays in one place.
    await load();
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function changeSort(key: SortKey) {
    const nextDirection = sort === key && direction === "asc" ? "desc" : "asc";
    const next = new URLSearchParams(params);
    next.set("sort", key);
    next.set("direction", nextDirection);
    setParams(next);
  }

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const engagementsById = useMemo(() => new Map(engagements.map((item) => [item.id, item])), [engagements]);
  const visibleTasks = useMemo(() => {
    const searchTerm = search.toLowerCase().trim();
    const filtered = searchTerm ? tasks.filter((task) => {
      const item = engagementsById.get(task.engagement_id);
      return [task.title, task.description, item?.client_name, item?.service_name].filter(Boolean).join(" ").toLowerCase().includes(searchTerm);
    }) : tasks;
    return [...filtered].sort((a, b) => {
      const aValue = sort === "title" ? a.title : sort === "status" ? STATUS_LABELS[a.status] : a.due_date;
      const bValue = sort === "title" ? b.title : sort === "status" ? STATUS_LABELS[b.status] : b.due_date;
      return aValue.localeCompare(bValue) * (direction === "asc" ? 1 : -1);
    });
  }, [direction, engagementsById, search, sort, tasks]);

  const filterCount = [status, assignee, engagement, search, overdueOnly, dueToday, mine].filter(Boolean).length;
  const scopeIsPersonal = user?.role === "TEAM_MEMBER" || mine;
  // Mirrors the backend: IsAdminOrManager guards POST /api/v1/tasks/. Hiding
  // the button is a courtesy; the server is what refuses.
  const canCreate = hasRole("ADMIN", "MANAGER");
  const sortMarker = (key: SortKey) => sort === key ? <span className="sort-marker">{direction === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="Task management"
        title={scopeIsPersonal ? "My tasks" : "All tasks"}
        description={scopeIsPersonal ? "The work currently assigned to you." : "Every task across the practice, in one focused view."}
        meta={<span className="task-count"><strong>{visibleTasks.length}</strong> shown</span>}
        actions={
          <>
            <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh task list">
              <Icon name="grid" /> Refresh
            </button>
            {canCreate ? <button className="primary" onClick={() => { setShowCreate((open) => !open); setNotice(null); }}><Icon name={showCreate ? "close" : "plus"} />{showCreate ? "Close" : "Create task"}</button> : null}
          </>
        }
      />

      {notice ? <p className="note note--ok">Created <Link className="task-link" to={`/tasks/${notice.id}`}>{notice.title}</Link>. <button className="text-button" onClick={() => setNotice(null)}>Dismiss</button></p> : null}

      {showCreate ? <CreateTaskForm engagements={engagements} people={people} onCreated={handleCreated} onCancel={() => setShowCreate(false)} /> : null}

      <Card>
        <div className="filter-bar">
          <label className="search-field search-field--wide">
            <Icon name="search" />
            <span className="sr-only">Search tasks</span>
            <input value={search} onChange={(event) => updateParam("search", event.target.value)} placeholder="Search task, client, or service" />
          </label>
          <label className="select-field"><span>Status</span><select value={status} onChange={(event) => updateParam("status", event.target.value)}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></label>
          {user?.role !== "TEAM_MEMBER" ? <label className="select-field"><span>Assignee</span><select value={assignee} onChange={(event) => updateParam("assignee", event.target.value)}><option value="">Everyone</option>{people.map((person) => <option key={person.id} value={person.id}>{personName(person)}</option>)}</select></label> : null}
          <label className="select-field"><span>Due date</span><select value={overdueOnly ? "overdue" : dueToday ? "today" : ""} onChange={(event) => { const next = new URLSearchParams(params); next.delete("overdue"); next.delete("due"); if (event.target.value === "overdue") next.set("overdue", "true"); if (event.target.value === "today") next.set("due", "today"); setParams(next); }}><option value="">Any date</option><option value="today">Due today</option><option value="overdue">Overdue</option></select></label>
          {user?.role !== "TEAM_MEMBER" ? <label className="check-filter"><input type="checkbox" checked={mine} onChange={(event) => updateParam("mine", event.target.checked ? "true" : "")} />Assigned to me</label> : null}
          {filterCount > 0 ? <button className="text-button" onClick={() => setParams(new URLSearchParams())}>Clear filters</button> : null}
        </div>
        {filterCount > 0 ? (
          <div className="chip-row chip-row--inset">
            {status ? <Chip label="Status" value={STATUS_LABELS[status as TaskStatus] ?? status} onRemove={() => updateParam("status", "")} /> : null}
            {assignee ? <Chip label="Assignee" value={personName(peopleById.get(Number(assignee)))} onRemove={() => updateParam("assignee", "")} /> : null}
            {engagement ? <Chip label="Engagement" value={engagementsById.get(Number(engagement))?.client_name ?? `#${engagement}`} onRemove={() => updateParam("engagement", "")} /> : null}
            {overdueOnly ? <Chip label="Due" value="Overdue" onRemove={() => updateParam("overdue", "")} /> : null}
            {dueToday ? <Chip label="Due" value="Today" onRemove={() => updateParam("due", "")} /> : null}
            {mine ? <Chip label="Scope" value="Assigned to me" onRemove={() => updateParam("mine", "")} /> : null}
            {search ? <Chip label="Search" value={search} onRemove={() => updateParam("search", "")} /> : null}
          </div>
        ) : null}
      </Card>

      <ErrorNote message={error} />
      {loading ? <Card><Skeleton variant="table" /></Card> : visibleTasks.length === 0 ? (
        <Card>
          <EmptyState
            title={filterCount ? "No tasks match these filters" : "No tasks yet"}
            body={filterCount
              ? "Try widening the filters, or clear them to see everything you can access."
              : "Tasks are generated from a service's templates when an engagement is created. Managers can also add one by hand."}
            action={filterCount
              ? { onClick: () => setParams(new URLSearchParams()), label: "Clear filters" }
              : canCreate ? { onClick: () => setShowCreate(true), label: "Create a task" } : undefined}
          />
        </Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table task-table">
              <thead><tr>
                <th><button className="sort-button" onClick={() => changeSort("title")}>Task {sortMarker("title")}</button></th>
                <th>Client &amp; engagement</th>
                <th>Assignee</th>
                <th><button className="sort-button" onClick={() => changeSort("due_date")}>Due date {sortMarker("due_date")}</button></th>
                <th><button className="sort-button" onClick={() => changeSort("status")}>Status {sortMarker("status")}</button></th>
                <th><span className="sr-only">Open task</span></th>
              </tr></thead>
              <tbody>{visibleTasks.map((task) => {
                const item = engagementsById.get(task.engagement_id);
                const person = task.assigned_to_id ? peopleById.get(task.assigned_to_id) : undefined;
                return <tr key={task.id} className={notice?.id === task.id ? "row-created" : undefined}>
                  <td><Link className="task-link" to={`/tasks/${task.id}`}>{task.title}</Link><small>Task #{task.id}</small></td>
                  <td>{item ? <span className="engagement-cell"><strong>{item.client_name}</strong><small>{item.service_name}</small></span> : <span className="muted">Engagement #{task.engagement_id}</span>}</td>
                  <td>{person ? <span className="assignee-cell"><span className="avatar avatar--tiny">{personName(person).slice(0, 2).toUpperCase()}</span>{personName(person)}</span> : <span className="muted">Unassigned</span>}</td>
                  <td className={isOverdue(task.due_date, task.status) ? "overdue" : ""}>{formatDate(task.due_date)}</td>
                  <td><StatusBadge status={task.status} /></td>
                  <td><Link className="row-action" to={`/tasks/${task.id}`} aria-label={`Open ${task.title}`}><Icon name="chevron-right" /></Link></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {nextCursor ? <div className="table-footer"><button className="secondary-button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more tasks"}</button></div> : null}
        </Card>
      )}
    </section>
  );
}
