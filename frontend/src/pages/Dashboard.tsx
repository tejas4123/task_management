import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { get } from "../api/client";
import type { DashboardSummary, Paginated, Task, TaskStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Card, ErrorNote, Loading, STATUS_LABELS, StatusBadge, formatDate, isOverdue } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";

interface Metric {
  label: string;
  value: number;
  to: string;
  icon: IconName;
  tone: "indigo" | "rose" | "amber" | "blue" | "violet";
  detail: string;
}

const openStatuses: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING_FOR_CLIENT", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<Task[]>([]);
  const [attention, setAttention] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().slice(0, 10);
    const queries = [
      get<DashboardSummary>("task", "/api/v1/tasks/dashboard/"),
      get<Paginated<Task>>("task", "/api/v1/tasks/?page_size=7"),
      get<Paginated<Task>>("task", `/api/v1/tasks/?status=${openStatuses.join(",")}&due_before=${today}&page_size=5`),
    ] as const;

    Promise.all(queries)
      .then(([dashboard, recentTasks, attentionTasks]) => {
        if (!active) return;
        setSummary(dashboard);
        setRecent(recentTasks.results);
        setAttention(attentionTasks.results);
      })
      .catch((caught: Error) => active && setError(caught.message));

    return () => { active = false; };
  }, []);

  const metrics: Metric[] = summary ? [
    { label: "Open tasks", value: summary.open_tasks, to: "/tasks", icon: "check-square", tone: "indigo", detail: "Across active engagements" },
    { label: "Overdue", value: summary.overdue, to: "/tasks?overdue=true", icon: "calendar", tone: "rose", detail: "Needs attention today" },
    { label: "Due today", value: summary.due_today, to: "/tasks?due=today", icon: "calendar", tone: "amber", detail: "Keep work moving" },
    { label: "Waiting for client", value: summary.waiting_for_client, to: "/tasks?status=WAITING_FOR_CLIENT", icon: "users", tone: "blue", detail: "Follow-up required" },
    { label: "Ready for review", value: summary.waiting_for_review, to: "/tasks?status=READY_FOR_REVIEW", icon: "eye", tone: "violet", detail: "Submitted work" },
  ] : [];

  return (
    <section className="page-section">
      <div className="page-heading page-heading--split">
        <div>
          <p className="eyebrow">{user?.role === "TEAM_MEMBER" ? "Personal workspace" : "Operations overview"}</p>
          <h1>{user?.role === "TEAM_MEMBER" ? "My work" : "Keep delivery on track"}</h1>
          <p className="subtitle">{user?.role === "TEAM_MEMBER" ? "A clear view of what needs your attention." : "A live picture of work across every client engagement."}</p>
        </div>
        <Link to="/tasks" className="button secondary-button">View all tasks <Icon name="chevron-right" /></Link>
      </div>

      <ErrorNote message={error} />
      {!summary ? <Loading /> : (
        <>
          <div className="metrics-grid">
            {metrics.map((metric) => (
              <Link className={`metric-card metric-card--${metric.tone}`} to={metric.to} key={metric.label}>
                <span className="metric-card__icon"><Icon name={metric.icon} /></span>
                <span className="metric-card__label">{metric.label}</span>
                <strong>{metric.value}</strong>
                <span className="metric-card__detail">{metric.detail}</span>
              </Link>
            ))}
          </div>

          <div className="dashboard-grid">
            <Card title="Recent tasks">
              {recent.length === 0 ? <p className="empty-copy">Tasks created from engagements will appear here.</p> : (
                <div className="table-wrap">
                  <table className="table task-summary-table">
                    <thead><tr><th>Task</th><th>Status</th><th>Due</th></tr></thead>
                    <tbody>{recent.map((task) => (
                      <tr key={task.id}>
                        <td><Link to={`/tasks/${task.id}`} className="task-link">{task.title}</Link><small>Engagement #{task.engagement_id}</small></td>
                        <td><StatusBadge status={task.status} /></td>
                        <td className={isOverdue(task.due_date, task.status) ? "overdue" : ""}>{formatDate(task.due_date)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <Link className="card-footer-link" to="/tasks">Open task list <Icon name="chevron-right" /></Link>
            </Card>

            <Card title={attention.length ? "Past due" : "Next up"}>
              {attention.length ? (
                <ul className="attention-list">
                  {attention.map((task) => (
                    <li key={task.id}>
                      <span className="attention-list__date"><strong>{new Date(task.due_date).getDate()}</strong><small>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(task.due_date))}</small></span>
                      <span className="attention-list__copy"><Link to={`/tasks/${task.id}`}>{task.title}</Link><small>{STATUS_LABELS[task.status]} · Engagement #{task.engagement_id}</small></span>
                      <Icon name="chevron-right" />
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-copy">No overdue work. You’re in a good place.</p>}
              <Link className="card-footer-link" to="/tasks?overdue=true">Review overdue tasks <Icon name="chevron-right" /></Link>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
