import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { get } from "../api/client";
import type { Client, Engagement, Paginated, Task } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  Card,
  EmptyState,
  ErrorNote,
  Skeleton,
  StatusBadge,
  formatDate,
  isOverdue,
} from "../components/ui";
import { PageHeader, TabPanel, Tabs } from "../components/layout";
import { Icon } from "../components/Icon";

/**
 * Everything this client has in flight, in one place.
 *
 * There is no "tasks by client" endpoint - tasks reference an engagement, and
 * engagements reference a client. So the engagements are fetched first and
 * their ids drive a single task query, rather than one request per engagement.
 */
export default function ClientDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [engagements, setEngagements] = useState<Engagement[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("engagements");

  const load = useCallback(async () => {
    const [detail, engagementPage] = await Promise.all([
      get<Client>("engagement", `/api/v1/clients/${id}/`),
      get<Paginated<Engagement>>(
        "engagement",
        `/api/v1/engagements/?client=${id}&page_size=200`,
      ),
    ]);

    setClient(detail);
    setEngagements(engagementPage.results);

    if (engagementPage.results.length === 0) {
      setTasks([]);
      return;
    }

    const pages = await Promise.all(
      engagementPage.results.map((engagement) =>
        get<Paginated<Task>>(
          "task",
          `/api/v1/tasks/?engagement_id=${engagement.id}&page_size=200`,
        ),
      ),
    );
    setTasks(pages.flatMap((page) => page.results));
  }, [id]);

  useEffect(() => {
    setError(null);
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  const engagementsById = useMemo(
    () => new Map((engagements ?? []).map((item) => [item.id, item])),
    [engagements],
  );

  const summary = useMemo(() => {
    const open = tasks.filter((task) => task.status !== "COMPLETED").length;
    const overdue = tasks.filter((task) => isOverdue(task.due_date, task.status)).length;
    const active = (engagements ?? []).filter((item) => item.status === "ACTIVE").length;
    return { open, overdue, active, engagements: (engagements ?? []).length };
  }, [tasks, engagements]);

  const attention = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.status !== "COMPLETED")
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, 8),
    [tasks],
  );

  if (error && !client) {
    return (
      <section className="page-section">
        <p className="crumbs">
          <Link to="/clients">
            <Icon name="arrow-left" /> Clients
          </Link>
        </p>
        <ErrorNote message={error} />
      </section>
    );
  }

  if (!client) {
    return (
      <section className="page-section">
        <Skeleton variant="heading" />
        <Skeleton variant="panel" />
        <Skeleton variant="table" />
      </section>
    );
  }

  return (
    <section className="page-section">
      <PageHeader
        backTo="/clients"
        backLabel="Clients"
        eyebrow="Client"
        title={client.name}
        description={`${client.email || "No email on file"}${client.phone ? ` · ${client.phone}` : ""}`}
        meta={
          <span className={`status-dot ${client.is_active ? "" : "status-dot--inactive"}`}>
            {client.is_active ? "Active" : "Inactive"}
          </span>
        }
      />

      <ErrorNote message={error} />

      <div className="info-grid">
        <div>
          <span className="info-grid__label">Engagements</span>
          <span className="info-grid__value">
            {summary.engagements}
            {summary.active > 0 ? <small>{summary.active} active</small> : null}
          </span>
        </div>
        <div>
          <span className="info-grid__label">Open tasks</span>
          <span className="info-grid__value">{summary.open}</span>
        </div>
        <div>
          <span className="info-grid__label">Overdue</span>
          <span className="info-grid__value">
            {summary.overdue > 0 ? <span className="overdue">{summary.overdue}</span> : 0}
          </span>
        </div>
        <div>
          <span className="info-grid__label">Client since</span>
          <span className="info-grid__value">
            {client.created_at ? formatDate(client.created_at) : "—"}
          </span>
        </div>
      </div>

      <Tabs
        items={[
          { id: "engagements", label: "Engagements", badge: engagements?.length ?? 0 },
          { id: "work", label: "Work in flight", badge: attention.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <TabPanel id="engagements" active={tab}>
      <Card title={`Engagements${engagements ? ` (${engagements.length})` : ""}`}>
        {engagements === null ? (
          <Skeleton variant="table" />
        ) : engagements.length === 0 ? (
          <EmptyState
            title="No engagements for this client yet"
            body="An engagement covers one service for one reporting period, and generates the task checklist for that period."
            action={
              hasRole("ADMIN", "MANAGER")
                ? { to: "/engagements", label: "Create engagement" }
                : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table engagement-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Service period</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open engagement</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="task-link" to={`/engagements/${item.id}`}>
                        {item.service_name}
                      </Link>
                      <small>{item.frequency.replaceAll("_", " ").toLowerCase()}</small>
                    </td>
                    <td>
                      <span className="period-cell">
                        <Icon name="calendar" />
                        {formatDate(item.period_start)} <span>–</span>{" "}
                        {formatDate(item.period_end)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`engagement-status engagement-status--${item.status.toLowerCase()}`}
                      >
                        {item.status.toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="row-action"
                        to={`/engagements/${item.id}`}
                        aria-label={`Open ${item.service_name} engagement`}
                      >
                        <Icon name="chevron-right" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      </TabPanel>

      <TabPanel id="work" active={tab}>
      <Card title="Work in flight">
        {attention.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            body="Every task for this client is complete, or no tasks have been generated yet."
          />
        ) : (
          <div className="table-wrap">
            <table className="table task-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Engagement</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open task</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {attention.map((task) => {
                  const engagement = engagementsById.get(task.engagement_id);
                  return (
                    <tr key={task.id}>
                      <td>
                        <Link className="task-link" to={`/tasks/${task.id}`}>
                          {task.title}
                        </Link>
                        <small>Task #{task.id}</small>
                      </td>
                      <td>
                        {engagement ? (
                          <Link
                            className="task-link"
                            to={`/engagements/${engagement.id}`}
                          >
                            {engagement.service_name}
                          </Link>
                        ) : (
                          <span className="muted">#{task.engagement_id}</span>
                        )}
                      </td>
                      <td className={isOverdue(task.due_date, task.status) ? "overdue" : ""}>
                        {formatDate(task.due_date)}
                      </td>
                      <td>
                        <StatusBadge status={task.status} />
                      </td>
                      <td>
                        <Link
                          className="row-action"
                          to={`/tasks/${task.id}`}
                          aria-label={`Open ${task.title}`}
                        >
                          <Icon name="chevron-right" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </TabPanel>
    </section>
  );
}
