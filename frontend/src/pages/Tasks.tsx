import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { get } from "../api/client";
import type { Engagement, Paginated, Task, TaskStatus, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, Empty, ErrorNote, Loading, STATUS_LABELS, StatusBadge, formatDate, isOverdue } from "../components/ui";
import { Icon } from "../components/Icon";

const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];
type SortKey = "title" | "due_date" | "status";

function personName(person: User | undefined) {
  if (!person) return "Unassigned";
  return `${person.first_name} ${person.last_name}`.trim() || person.username;
}

export default function Tasks() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [people, setPeople] = useState<User[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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
  const sortMarker = (key: SortKey) => sort === key ? <span className="sort-marker">{direction === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <section className="page-section">
      <div className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">Task management</p>
          <h1>{scopeIsPersonal ? "My tasks" : "All tasks"}</h1>
          <p className="subtitle">{scopeIsPersonal ? "The work currently assigned to you." : "Every task across the practice, in one focused view."}</p>
        </div>
        <span className="task-count"><strong>{visibleTasks.length}</strong> shown</span>
      </div>

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
      </Card>

      <ErrorNote message={error} />
      {loading ? <Loading /> : visibleTasks.length === 0 ? <Card><Empty>{filterCount ? "No tasks match the selected filters." : "No tasks have been generated yet."}</Empty></Card> : (
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
                return <tr key={task.id}>
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
