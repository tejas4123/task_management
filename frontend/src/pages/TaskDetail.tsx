import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { get, post } from "../api/client";
import type { Engagement, Paginated, TaskDetail as TaskDetailType, TaskStatus, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  Card,
  ErrorNote,
  Loading,
  STATUS_LABELS,
  StatusBadge,
  formatDate,
} from "../components/ui";
import { Icon } from "../components/Icon";

/** Transitions that are a reviewer decision rather than progress on the work. */
const REVIEW_TRANSITIONS: TaskStatus[] = ["COMPLETED", "CHANGES_REQUESTED"];

const WORK_ACTIONS: Partial<Record<TaskStatus, { label: string; description: string; tone: "primary" | "outline" }>> = {
  IN_PROGRESS: { label: "Start work", description: "Move this task into active work.", tone: "primary" },
  WAITING_FOR_CLIENT: { label: "Waiting for client", description: "Pause while client input is needed.", tone: "outline" },
  READY_FOR_REVIEW: { label: "Submit for review", description: "Send the completed work to a reviewer.", tone: "primary" },
};

export default function TaskDetail() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();

  const [task, setTask] = useState<TaskDetailType | null>(null);
  const [people, setPeople] = useState<User[]>([]);
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [comment, setComment] = useState("");
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const detail = await get<TaskDetailType>("task", `/api/v1/tasks/${id}/`);
    setTask(detail);
    setAssigneeDraft(detail.assigned_to_id ? String(detail.assigned_to_id) : "");
    setDueDateDraft(detail.due_date);
    get<Engagement>("engagement", `/api/v1/engagements/${detail.engagement_id}/`)
      .then(setEngagement)
      .catch(() => setEngagement(null));
  }, [id]);

  useEffect(() => {
    load().catch((caught: Error) => setError(caught.message));
  }, [load]);

  useEffect(() => {
    if (!hasRole("ADMIN", "MANAGER")) return;
    get<Paginated<User>>("auth", "/api/v1/users/?role=TEAM_MEMBER&is_active=true")
      .then((page) => setPeople(page.results))
      .catch(() => setPeople([]));
  }, [hasRole]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);

    try {
      await action();
      await load();
      setComment("");
    } catch (caught) {
      // A 403/400 here is the backend rejecting the action - show its reason
      // verbatim rather than guessing.
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !task) return <ErrorNote message={error} />;
  if (!task) return <Loading />;

  const isAssignee = task.assigned_to_id === user?.id;
  const isManager = hasRole("ADMIN", "MANAGER");
  const canReview = isManager && !isAssignee;
  const canProgressWork = isManager || isAssignee;

  const workerTransitions = task.allowed_transitions.filter(
    (status) => canProgressWork && !REVIEW_TRANSITIONS.includes(status),
  );
  const assignee = task.assigned_to_id
    ? people.find((person) => person.id === task.assigned_to_id) ?? (task.assigned_to_id === user?.id ? user : undefined)
    : undefined;
  const workflow: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "READY_FOR_REVIEW", "COMPLETED"];
  const activeIndex = workflow.indexOf(task.status);
  const hasManagementChanges = assigneeDraft !== String(task.assigned_to_id ?? "") || dueDateDraft !== task.due_date;
  const showActionPanel = workerTransitions.length > 0 || canReview;
  const taskId = task.id;
  const currentAssigneeId = task.assigned_to_id;
  const currentDueDate = task.due_date;
  const emptyActionCopy = task.status === "COMPLETED"
    ? { title: "This task is complete", body: "There are no further workflow actions." }
    : task.status === "READY_FOR_REVIEW"
      ? { title: "Awaiting review", body: "A manager or administrator needs to make the next decision." }
      : { title: "Waiting for an assignee", body: "Assign this task before it can move forward." };

  async function saveTaskSettings() {
    await run(async () => {
      if (assigneeDraft !== String(currentAssigneeId ?? "")) {
        await post("task", `/api/v1/tasks/${taskId}/assign/`, {
          assigned_to_id: assigneeDraft ? Number(assigneeDraft) : null,
        });
      }
      if (dueDateDraft !== currentDueDate) {
        await post("task", `/api/v1/tasks/${taskId}/due-date/`, { due_date: dueDateDraft });
      }
    });
  }

  return (
    <section className="page-section task-detail">
      <p className="crumbs">
        <Link to="/tasks"><Icon name="arrow-left" /> Tasks</Link>
      </p>

      <div className="page-heading"><p className="eyebrow">Task #{task.id} {task.created_by_type === "SYSTEM" ? "· From a service template" : ""}</p><h1>{task.title}</h1><p className="subtitle"><StatusBadge status={task.status} /> <span className="detail-subtitle-separator">•</span> Due {formatDate(task.due_date)}</p></div>

      <ErrorNote message={error} />

      <div className="task-info-grid">
        <div><span>Client</span><strong>{engagement?.client_name ?? "Loading engagement…"}</strong></div>
        <div><span>Engagement</span><strong>{engagement?.service_name ?? `Engagement #${task.engagement_id}`}</strong></div>
        <div><span>Assignee</span><strong>{assignee ? `${assignee.first_name} ${assignee.last_name}`.trim() || assignee.username : "Unassigned"}</strong></div>
        <div><span>Due date</span><strong>{formatDate(task.due_date)}</strong></div>
      </div>

      {task.description ? (
        <Card title="Description">
          <p className="detail-description">{task.description}</p>
        </Card>
      ) : null}

      <Card title="Workflow">
        <div className="workflow-strip">
          {workflow.map((status, index) => <div className={`workflow-step ${index <= activeIndex ? "workflow-step--complete" : ""} ${status === task.status ? "workflow-step--current" : ""}`} key={status}><span>{index + 1}</span><strong>{STATUS_LABELS[status]}</strong></div>)}
        </div>
        {(task.status === "WAITING_FOR_CLIENT" || task.status === "CHANGES_REQUESTED") ? <p className="workflow-note">This task is currently <StatusBadge status={task.status} /> and will return to In progress when work can resume.</p> : null}
      </Card>

      <Card title="Actions">
        <div className="action-panel">
          {showActionPanel ? <>
            <div className="action-panel__intro"><strong>{canReview ? "Choose the next decision" : "Move work forward"}</strong><span>Every update is recorded in the task history.</span></div>
            <label className="action-panel__comment"><span>Activity note <em>optional</em></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} placeholder="Add context for the assignee or reviewer" /></label>
            <div className="action-panel__buttons">
              {workerTransitions.map((status) => {
                const action = WORK_ACTIONS[status];
                if (!action) return null;
                const label = status === "IN_PROGRESS" && task.status !== "NOT_STARTED" ? "Resume work" : action.label;
                return <button className={`workflow-action workflow-action--${action.tone}`} key={status} disabled={busy} onClick={() => void run(() => post("task", `/api/v1/tasks/${task.id}/status/`, { status, comment }))}><span><strong>{label}</strong><small>{action.description}</small></span><Icon name="chevron-right" /></button>;
              })}
              {canReview && task.allowed_transitions.includes("COMPLETED") ? <button className="workflow-action workflow-action--approve" disabled={busy} onClick={() => void run(() => post("task", `/api/v1/tasks/${task.id}/approve/`, { comment }))}><span><strong>Approve work</strong><small>Mark this task as complete.</small></span><Icon name="check-square" /></button> : null}
              {canReview && task.allowed_transitions.includes("CHANGES_REQUESTED") ? <button className="workflow-action workflow-action--changes" disabled={busy || !comment.trim()} title={comment.trim() ? "" : "Add a note explaining what needs to change"} onClick={() => void run(() => post("task", `/api/v1/tasks/${task.id}/request-changes/`, { comment }))}><span><strong>Request changes</strong><small>Send it back with your feedback.</small></span><Icon name="arrow-left" /></button> : null}
            </div>
          </> : <div className="action-panel__empty"><Icon name="check-square" /><div><strong>{emptyActionCopy.title}</strong><span>{emptyActionCopy.body}</span></div></div>}
        </div>
      </Card>

      {isManager ? <Card title="Task settings"><div className="task-settings"><label><span>Assignee</span><select value={assigneeDraft} disabled={busy || task.status === "COMPLETED"} onChange={(event) => setAssigneeDraft(event.target.value)}><option value="">Unassigned</option>{people.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name} (@{person.username})</option>)}</select></label><label><span>Due date</span><input type="date" value={dueDateDraft} disabled={busy} onChange={(event) => setDueDateDraft(event.target.value)} /></label><button className="secondary-button" disabled={busy || !hasManagementChanges} onClick={() => void saveTaskSettings()}>{busy ? "Saving…" : "Save settings"}</button></div></Card> : null}

      <Card title="History">
        {task.history.length === 0 ? (
          <p className="muted">Nothing has happened to this task yet.</p>
        ) : (
          <ol className="timeline">
            {task.history.map((entry) => (
              <li key={entry.id}>
                <span className="muted">{new Date(entry.created_at).toLocaleString()}</span>{" "}
                <strong>
                  {STATUS_LABELS[entry.from_status]} → {STATUS_LABELS[entry.to_status]}
                </strong>{" "}
                <span className="muted">by user #{entry.changed_by_id}</span>
                {entry.comment ? <p>{entry.comment}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
