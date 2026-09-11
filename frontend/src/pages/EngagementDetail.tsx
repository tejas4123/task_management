import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { get, patch, post } from "../api/client";
import type { Engagement, EngagementStatus, Paginated, Task, User } from "../api/types";
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
import { useToast } from "../components/Toast";
import { PageHeader } from "../components/layout";
import { Icon } from "../components/Icon";

const STATUS_COPY: Record<EngagementStatus, { label: string; hint: string }> = {
  ACTIVE: { label: "Active", hint: "Work is in progress for this period." },
  COMPLETED: { label: "Completed", hint: "All work for this period is finished." },
  CANCELLED: { label: "Cancelled", hint: "This period was called off." },
};

const FREQUENCY_LABELS: Record<string, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

function personName(person: User | undefined) {
  if (!person) return null;
  return `${person.first_name} ${person.last_name}`.trim() || person.username;
}

export default function EngagementDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const toast = useToast();

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [periodDraft, setPeriodDraft] = useState({ period_start: "", period_end: "" });

  const canManage = hasRole("ADMIN", "MANAGER");

  const load = useCallback(async () => {
    const detail = await get<Engagement>("engagement", `/api/v1/engagements/${id}/`);
    setEngagement(detail);
    setPeriodDraft({ period_start: detail.period_start, period_end: detail.period_end });

    // The task list is this engagement's real content, so a failure here must
    // surface rather than leave an empty table that looks like "no tasks".
    const page = await get<Paginated<Task>>(
      "task",
      `/api/v1/tasks/?engagement_id=${id}&page_size=200`,
    );
    setTasks(page.results);
  }, [id]);

  useEffect(() => {
    setError(null);
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  useEffect(() => {
    get<Paginated<User>>("auth", "/api/v1/users/?page_size=200")
      .then((page) => setPeople(page.results))
      .catch(() => setPeople([]));
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      toast.success(success);
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const progress = useMemo(() => {
    if (!tasks) return null;
    const done = tasks.filter((task) => task.status === "COMPLETED").length;
    const overdue = tasks.filter((task) => isOverdue(task.due_date, task.status)).length;
    return { done, overdue, total: tasks.length };
  }, [tasks]);

  if (error && !engagement) {
    return (
      <section className="page-section">
        <p className="crumbs">
          <Link to="/engagements">
            <Icon name="arrow-left" /> Engagements
          </Link>
        </p>
        <ErrorNote message={error} />
      </section>
    );
  }

  if (!engagement) {
    return (
      <section className="page-section">
        <Skeleton variant="heading" />
        <Skeleton variant="panel" />
        <Skeleton variant="table" />
      </section>
    );
  }

  const status = STATUS_COPY[engagement.status];
  const nextStatuses = (Object.keys(STATUS_COPY) as EngagementStatus[]).filter(
    (value) => value !== engagement.status,
  );

  async function saveStatus(next: EngagementStatus) {
    await run(
      () => post("engagement", `/api/v1/engagements/${id}/status/`, { status: next }),
      `Engagement marked ${STATUS_COPY[next].label.toLowerCase()}.`,
    );
  }

  async function savePeriod(event: FormEvent) {
    event.preventDefault();
    if (periodDraft.period_end < periodDraft.period_start) {
      setError("The period end must be on or after the period start.");
      return;
    }
    await run(async () => {
      await patch("engagement", `/api/v1/engagements/${id}/`, periodDraft);
      setEditing(false);
    }, "The service period has been updated.");
  }

  return (
    <section className="page-section">
      <PageHeader
        backTo="/engagements"
        backLabel="Engagements"
        eyebrow={`${engagement.service_name} · ${FREQUENCY_LABELS[engagement.frequency] ?? engagement.frequency}`}
        title={engagement.client_name}
        description={`${formatDate(engagement.period_start)} – ${formatDate(engagement.period_end)} · ${status.hint}`}
        meta={
          <span className={`engagement-status engagement-status--${engagement.status.toLowerCase()}`}>
            {status.label}
          </span>
        }
      />

      <ErrorNote message={error} />

      <div className="info-grid">
        <div>
          <span className="info-grid__label">Client</span>
          <Link className="info-grid__value info-grid__value--link" to={`/clients/${engagement.client}`}>
            {engagement.client_name}
          </Link>
        </div>
        <div>
          <span className="info-grid__label">Service</span>
          <span className="info-grid__value">{engagement.service_name}</span>
        </div>
        <div>
          <span className="info-grid__label">Service period</span>
          <span className="info-grid__value">
            {formatDate(engagement.period_start)} – {formatDate(engagement.period_end)}
          </span>
        </div>
        <div>
          <span className="info-grid__label">Progress</span>
          <span className="info-grid__value">
            {progress ? `${progress.done} of ${progress.total} complete` : "—"}
            {progress && progress.overdue > 0 ? (
              <small className="overdue">{progress.overdue} overdue</small>
            ) : null}
          </span>
        </div>
      </div>

      {canManage ? (
        <Card title="Manage engagement">
          <div className="manage-row">
            <div className="manage-row__group">
              <span className="info-grid__label">Status</span>
              <div className="manage-row__buttons">
                {nextStatuses.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void saveStatus(value)}
                  >
                    Mark {STATUS_COPY[value].label.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="manage-row__group">
              <span className="info-grid__label">Service period</span>
              {editing ? (
                <form className="manage-row__form" onSubmit={savePeriod}>
                  <label>
                    <span className="sr-only">Period start</span>
                    <input
                      type="date"
                      value={periodDraft.period_start}
                      onChange={(event) =>
                        setPeriodDraft({ ...periodDraft, period_start: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span className="sr-only">Period end</span>
                    <input
                      type="date"
                      value={periodDraft.period_end}
                      onChange={(event) =>
                        setPeriodDraft({ ...periodDraft, period_end: event.target.value })
                      }
                      required
                    />
                  </label>
                  <button className="primary" type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setPeriodDraft({
                        period_start: engagement.period_start,
                        period_end: engagement.period_end,
                      });
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button className="secondary-button" type="button" onClick={() => setEditing(true)}>
                  <Icon name="calendar" /> Change dates
                </button>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <Card title={`Tasks${tasks ? ` (${tasks.length})` : ""}`}>
        {tasks === null ? (
          <Skeleton variant="table" />
        ) : tasks.length === 0 ? (
          <EmptyState
            title="No tasks for this engagement yet"
            body="Tasks are generated from the service's task templates when an engagement is created. If none appeared, the service may have no templates."
            action={
              hasRole("ADMIN")
                ? { to: "/services", label: "Review service templates" }
                : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table task-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assignee</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open task</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const assignee = task.assigned_to_id
                    ? personName(peopleById.get(task.assigned_to_id))
                    : null;
                  return (
                    <tr key={task.id}>
                      <td>
                        <Link className="task-link" to={`/tasks/${task.id}`}>
                          {task.title}
                        </Link>
                        <small>Task #{task.id}</small>
                      </td>
                      <td>
                        {assignee ? (
                          <span className="assignee-cell">
                            <span className="avatar avatar--tiny">
                              {assignee.slice(0, 2).toUpperCase()}
                            </span>
                            {assignee}
                          </span>
                        ) : (
                          <span className="muted">Unassigned</span>
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
    </section>
  );
}
