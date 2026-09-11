import { useEffect, useMemo, useState, type FormEvent } from "react";

import { get, post } from "../api/client";
import type { Engagement, Paginated, Task, TaskTemplate, User } from "../api/types";
import { Card, ErrorNote } from "./ui";

/**
 * Manual task creation.
 *
 * A task carries a NOT NULL `template_id` under UNIQUE(engagement_id,
 * template_id) - the constraint that makes worker task generation idempotent.
 * So a manual task instantiates a real template rather than inventing one, and
 * templates the engagement already has a task for are filtered out here. The
 * backend still answers 409 if one slips through, which is what actually
 * guarantees it under concurrency.
 */

const EMPTY_FORM = {
  engagement_id: "",
  template_id: "",
  title: "",
  description: "",
  due_date: "",
  assigned_to_id: "",
};

function personName(person: User) {
  return `${person.first_name} ${person.last_name}`.trim() || person.username;
}

/** `period_start` plus the template's `default_due_days`, as a date input value. */
function defaultDueDate(engagement: Engagement, template: TaskTemplate): string {
  const due = new Date(engagement.period_start);
  due.setDate(due.getDate() + template.default_due_days);
  return due.toISOString().slice(0, 10);
}

interface Props {
  engagements: Engagement[];
  people: User[];
  onCreated: (task: Task) => void;
  onCancel: () => void;
}

export function CreateTaskForm({ engagements, people, onCreated, onCancel }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [usedTemplateIds, setUsedTemplateIds] = useState<Set<number>>(new Set());
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engagement = useMemo(
    () => engagements.find((item) => String(item.id) === form.engagement_id),
    [engagements, form.engagement_id],
  );

  // Templates belong to the engagement's service, so the choice only becomes
  // meaningful once an engagement is picked.
  useEffect(() => {
    if (!engagement) {
      setTemplates([]);
      setUsedTemplateIds(new Set());
      return;
    }

    let cancelled = false;
    setLoadingTemplates(true);
    setError(null);

    Promise.all([
      get<Paginated<TaskTemplate>>(
        "engagement",
        `/api/v1/templates/?service_type=${engagement.service_type}&page_size=200`,
      ),
      // page_size covers the whole engagement in one read: its task count is
      // its template count. If one is ever missed the backend answers 409.
      get<Paginated<Task>>(
        "task",
        `/api/v1/tasks/?engagement_id=${engagement.id}&page_size=200`,
      ),
    ])
      .then(([templatePage, taskPage]) => {
        if (cancelled) return;
        setTemplates(templatePage.results);
        setUsedTemplateIds(new Set(taskPage.results.map((task) => task.template_id)));
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [engagement]);

  const availableTemplates = useMemo(
    () => templates.filter((template) => !usedTemplateIds.has(template.id)),
    [templates, usedTemplateIds],
  );

  function chooseEngagement(value: string) {
    // The template, and everything prefilled from it, belongs to the old
    // engagement's service - clear rather than carry it over.
    setForm({ ...EMPTY_FORM, engagement_id: value });
  }

  function chooseTemplate(value: string) {
    const template = templates.find((item) => String(item.id) === value);

    if (!template || !engagement) {
      setForm((current) => ({ ...current, template_id: value }));
      return;
    }

    setForm((current) => ({
      ...current,
      template_id: value,
      // Prefilled, not locked: the point of a manual task is adjusting it.
      title: template.title,
      description: template.description,
      due_date: defaultDueDate(engagement, template),
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.engagement_id || !form.template_id || !form.title.trim() || !form.due_date) {
      setError("Choose an engagement and template, and give the task a title and due date.");
      return;
    }

    setSubmitting(true);
    try {
      const task = await post<Task>("task", "/api/v1/tasks/", {
        engagement_id: Number(form.engagement_id),
        template_id: Number(form.template_id),
        title: form.title.trim(),
        description: form.description.trim(),
        due_date: form.due_date,
        assigned_to_id: form.assigned_to_id ? Number(form.assigned_to_id) : null,
      });

      setForm(EMPTY_FORM);
      onCreated(task);
    } catch (caught) {
      // Covers 400 field errors, 403 and the 409 duplicate - the wrapper
      // already flattens DRF's detail payload into a readable message.
      setError((caught as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const templateHint = !engagement
    ? "Choose an engagement first"
    : loadingTemplates
      ? "Loading templates…"
      : availableTemplates.length === 0
        ? "Every template for this service already has a task"
        : "";

  return (
    <Card title="Create task">
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          <span>Engagement</span>
          <select
            value={form.engagement_id}
            onChange={(event) => chooseEngagement(event.target.value)}
            required
          >
            <option value="">Choose an engagement</option>
            {engagements.map((item) => (
              <option key={item.id} value={item.id}>
                {item.client_name} — {item.service_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Task template</span>
          <select
            value={form.template_id}
            onChange={(event) => chooseTemplate(event.target.value)}
            disabled={!engagement || loadingTemplates || availableTemplates.length === 0}
            required
          >
            <option value="">{templateHint || "Choose a template"}</option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.sequence}. {template.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Due date</span>
          <input
            type="date"
            value={form.due_date}
            onChange={(event) => setForm({ ...form, due_date: event.target.value })}
            required
          />
        </label>

        <label>
          <span>Assignee</span>
          <select
            value={form.assigned_to_id}
            onChange={(event) => setForm({ ...form, assigned_to_id: event.target.value })}
          >
            <option value="">Leave unassigned</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {personName(person)}
              </option>
            ))}
          </select>
        </label>

        <label className="form-grid__wide">
          <span>Title</span>
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="What needs doing"
            maxLength={255}
            required
          />
        </label>

        <label className="form-grid__wide">
          <span>Description</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={2}
            placeholder="Optional detail for whoever picks this up"
          />
        </label>

        <ErrorNote message={error} />

        <div className="form-grid__action">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create task"}
          </button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <span>The task starts as Not started and enters the normal workflow.</span>
        </div>
      </form>
    </Card>
  );
}
