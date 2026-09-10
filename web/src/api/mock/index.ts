import type { ApiAdapter } from "../adapter";
import { ApiError } from "../errors";
import { tokenStore } from "../tokens";
import type {
  Client,
  CursorPage,
  DashboardSummary,
  Engagement,
  Paginated,
  ServiceType,
  Task,
  TaskDetail,
  TaskStatus,
  TaskTemplate,
  User,
} from "../types";
import { TASK_STATUSES } from "../types";
import {
  clients,
  DEMO_PASSWORD,
  engagements,
  history,
  historyByTask,
  services,
  tasks,
  templates,
  users,
} from "./seed";

/* ---------------------------------------------------------------------------
   An in-memory stand-in for the four services.

   This exists so the UI runs, and demos, with no backend at all. It is written
   as a *server*, not as a convenience: it enforces the transition map, the
   authorization rules and the duplicate constraint, and it raises the same
   status codes and the same `detail` strings the Django services raise. That
   is the point - if the mock let everything through, none of the UI's error
   handling would ever be exercised.

   Set VITE_USE_MOCK=false to talk to the real services instead.
--------------------------------------------------------------------------- */

/** Enough delay that skeletons and pending states are visible, not enough to annoy. */
const LATENCY = 120;

const settle = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));

/* --- the transition map -------------------------------------------------- */

/**
 * Mirrors `services/task-service/tasks/workflow.py`.
 *
 * It lives here, on the server side of the boundary, and never leaks into a
 * component: the UI renders from the `allowed_transitions` each task carries.
 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_FOR_CLIENT", "READY_FOR_REVIEW"],
  WAITING_FOR_CLIENT: ["IN_PROGRESS"],
  READY_FOR_REVIEW: ["COMPLETED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: ["IN_PROGRESS"],
  COMPLETED: [],
};

const isReviewDecision = (to: TaskStatus) =>
  to === "COMPLETED" || to === "CHANGES_REQUESTED";

const canManage = (role: User["role"]) => role === "ADMIN" || role === "MANAGER";

/* --- session ------------------------------------------------------------- */

const base64url = (value: string) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * A structurally valid JWT with real claims and a nonsense signature.
 *
 * The UI decodes the token to read the role, so the mock has to produce
 * something `decodeJwt` can actually read.
 */
function issueToken(user: User): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      user_id: user.id,
      role: user.role,
      email: user.email,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    }),
  );
  return `${header}.${payload}.mock-signature-not-verified`;
}

/**
 * Who is calling.
 *
 * Read back off the stored token rather than held in a variable, so a page
 * reload restores the session exactly the way the real services would.
 */
function currentUser(): User {
  const token = tokenStore.access();
  if (!token) throw new ApiError("Authentication credentials were not provided.", 401);

  try {
    const claims = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { user_id: number };

    const user = users.find((candidate) => candidate.id === claims.user_id);
    if (!user) throw new Error("unknown user");
    return user;
  } catch {
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
}

function requireManager(user: User, action: string): void {
  if (!canManage(user.role)) {
    throw new ApiError(`Only an admin or manager can ${action}.`, 403);
  }
}

function requireAdmin(user: User): void {
  if (user.role !== "ADMIN") {
    throw new ApiError("Only an admin can perform this action.", 403);
  }
}

/* --- shaping ------------------------------------------------------------- */

const page = <T>(results: T[]): Paginated<T> => ({
  results,
  count: results.length,
  next: null,
  previous: null,
});

/**
 * The moves this viewer may make on this task, right now.
 *
 * Two gates, both of which the real service applies: the transition has to be
 * on the map, and the caller has to be entitled to make it. A review decision
 * needs a manager who is not the assignee; everything else needs the assignee.
 */
function allowedFor(task: Task, user: User): TaskStatus[] {
  return ALLOWED_TRANSITIONS[task.status].filter((to) =>
    isReviewDecision(to)
      ? canManage(user.role) && task.assigned_to_id !== user.id
      : task.assigned_to_id === user.id,
  );
}

const withTransitions = (task: Task, user: User): Task => ({
  ...task,
  allowed_transitions: allowedFor(task, user),
});

/** A team member never sees another member's task - scoped, not filtered later. */
const visibleTo = (user: User): Task[] =>
  canManage(user.role)
    ? tasks
    : tasks.filter((task) => task.assigned_to_id === user.id);

function findTask(id: number, user: User): Task {
  const task = visibleTo(user).find((candidate) => candidate.id === id);
  // Not "forbidden" - a task you cannot see does not exist, so nothing leaks.
  if (!task) throw new ApiError("Not found.", 404);
  return task;
}

let nextHistoryId = Math.max(...history.map((entry) => entry.id)) + 1;

/** Every status change appends to the audit trail. Nothing else writes status. */
function applyTransition(
  task: Task,
  to: TaskStatus,
  user: User,
  comment: string,
): Task {
  const from = task.status;

  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ApiError(`Cannot transition from ${from} to ${to}.`, 400);
  }

  if (isReviewDecision(to)) {
    requireManager(user, "review work");
    if (task.assigned_to_id === user.id) {
      throw new ApiError("You cannot review work assigned to you.", 403);
    }
  } else if (task.assigned_to_id !== user.id) {
    throw new ApiError("You can only update tasks assigned to you.", 403);
  }

  const now = new Date().toISOString();

  task.status = to;
  task.updated_at = now;
  task.completed_at = to === "COMPLETED" ? now : null;

  const entry = {
    id: nextHistoryId++,
    from_status: from,
    to_status: to,
    changed_by_id: user.id,
    comment,
    created_at: now,
  };

  history.push(entry);
  historyByTask.set(task.id, [...(historyByTask.get(task.id) ?? []), entry]);

  return withTransitions(task, user);
}

/* --- period rules -------------------------------------------------------- */

const asDay = (value: string) => new Date(`${value}T00:00:00Z`);

const lastOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();

/**
 * Mirrors the engagement service's period rules: a recurring engagement has to
 * line up with a whole calendar month, quarter or year.
 */
function validatePeriod(service: ServiceType, start: string, end: string): void {
  const from = asDay(start);
  const to = asDay(end);

  if (to <= from) {
    throw new ApiError("period_end must fall after period_start.", 400);
  }

  if (service.frequency === "ONE_TIME") return;

  const wholeMonths =
    from.getUTCDate() === 1 && to.getUTCDate() === lastOfMonth(to) ? 1 : 0;

  const span =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth()) +
    1;

  const required = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[service.frequency];
  const alignedStart =
    service.frequency === "MONTHLY" ||
    (service.frequency === "QUARTERLY" && from.getUTCMonth() % 3 === 0) ||
    (service.frequency === "YEARLY" && true);

  if (!wholeMonths || span !== required || !alignedStart) {
    const noun = { MONTHLY: "calendar month", QUARTERLY: "quarter", YEARLY: "year" }[
      service.frequency
    ];
    throw new ApiError(`A ${service.frequency} engagement must cover a whole ${noun}.`, 400);
  }
}

/**
 * What the worker does when it picks up ENGAGEMENT_CREATED: fetch the service's
 * templates and create one task per template.
 *
 * Keyed on (engagement, template), so replaying it creates nothing - the same
 * guarantee the real `UNIQUE(engagement_id, template_id)` constraint gives.
 */
function generateTasks(engagement: Engagement): void {
  const nextId = () => Math.max(0, ...tasks.map((task) => task.id)) + 1;
  const now = new Date().toISOString();

  for (const template of templates.filter(
    (candidate) => candidate.service_type === engagement.service_type,
  )) {
    const exists = tasks.some(
      (task) =>
        task.engagement_id === engagement.id && task.template_id === template.id,
    );
    if (exists) continue;

    const due = new Date(
      asDay(engagement.period_start).getTime() +
        template.default_due_days * 86_400_000,
    );

    tasks.push({
      id: nextId(),
      engagement_id: engagement.id,
      template_id: template.id,
      title: template.title,
      description: template.description,
      assigned_to_id: null,
      created_by_id: null,
      created_by_type: "SYSTEM",
      due_date: due.toISOString().slice(0, 10),
      status: "NOT_STARTED",
      allowed_transitions: [],
      completed_at: null,
      created_at: now,
      updated_at: now,
    });
  }
}

/* --- the adapter --------------------------------------------------------- */

export const mockApi: ApiAdapter = {
  auth: {
    async login(username, password) {
      const user = users.find((candidate) => candidate.username === username);

      if (!user || password !== DEMO_PASSWORD) {
        throw new ApiError(
          "No active account found with the given credentials.",
          401,
        );
      }
      if (!user.is_active) {
        throw new ApiError("This account has been deactivated.", 401);
      }

      const access = issueToken(user);
      tokenStore.set(access, `${access}.refresh`);

      return settle({ access, refresh: `${access}.refresh`, user });
    },

    me: () => settle(currentUser()),
  },

  users: {
    list(params = {}) {
      currentUser();
      let results = users;

      if (params.role) results = results.filter((user) => user.role === params.role);
      if (params.is_active !== undefined) {
        results = results.filter((user) => user.is_active === params.is_active);
      }

      return settle(page(results));
    },

    create(input) {
      requireAdmin(currentUser());

      if (users.some((user) => user.username === input.username)) {
        throw new ApiError("A user with that username already exists.", 409);
      }

      const now = new Date().toISOString();
      const user: User = {
        id: Math.max(...users.map((candidate) => candidate.id)) + 1,
        username: input.username,
        email: input.email,
        first_name: input.first_name ?? "",
        last_name: input.last_name ?? "",
        role: input.role,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      users.push(user);
      return settle(user);
    },

    deactivate(id) {
      requireAdmin(currentUser());

      const user = users.find((candidate) => candidate.id === id);
      if (!user) throw new ApiError("Not found.", 404);

      // DELETE deactivates rather than removing - history still points at them.
      user.is_active = false;
      return settle(undefined);
    },
  },

  clients: {
    list(params = {}) {
      currentUser();
      let results = clients;

      if (params.is_active !== undefined) {
        results = results.filter((client) => client.is_active === params.is_active);
      }
      if (params.search) {
        const needle = params.search.toLowerCase();
        results = results.filter((client) =>
          client.name.toLowerCase().includes(needle),
        );
      }

      return settle(page(results));
    },

    create(input) {
      requireAdmin(currentUser());

      const now = new Date().toISOString();
      const client: Client = {
        id: Math.max(...clients.map((candidate) => candidate.id)) + 1,
        name: input.name,
        email: input.email ?? "",
        phone: input.phone ?? "",
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      clients.push(client);
      return settle(client);
    },

    update(id, input) {
      requireAdmin(currentUser());

      const client = clients.find((candidate) => candidate.id === id);
      if (!client) throw new ApiError("Not found.", 404);

      Object.assign(client, input, { updated_at: new Date().toISOString() });
      return settle(client);
    },

    deactivate(id) {
      requireAdmin(currentUser());

      const client = clients.find((candidate) => candidate.id === id);
      if (!client) throw new ApiError("Not found.", 404);

      client.is_active = false;
      return settle(undefined);
    },
  },

  services: {
    list() {
      currentUser();
      return settle(page(services));
    },

    create(input) {
      requireAdmin(currentUser());

      if (services.some((service) => service.name === input.name)) {
        throw new ApiError("A service with that name already exists.", 409);
      }

      const now = new Date().toISOString();
      const service: ServiceType = {
        id: Math.max(...services.map((candidate) => candidate.id)) + 1,
        name: input.name,
        description: input.description ?? "",
        frequency: input.frequency,
        is_recurring: input.frequency !== "ONE_TIME",
        created_at: now,
        updated_at: now,
      };

      services.push(service);
      return settle(service);
    },

    templates(serviceTypeId) {
      currentUser();

      const results: TaskTemplate[] =
        serviceTypeId === undefined
          ? templates
          : templates.filter(
              (template) => template.service_type === serviceTypeId,
            );

      return settle(page([...results].sort((a, b) => a.sequence - b.sequence)));
    },
  },

  engagements: {
    list(filters = {}) {
      currentUser();
      let results = engagements;

      if (filters.client) {
        results = results.filter((item) => item.client === filters.client);
      }
      if (filters.service_type) {
        results = results.filter((item) => item.service_type === filters.service_type);
      }
      if (filters.status) {
        results = results.filter((item) => item.status === filters.status);
      }

      const sorted = [...results].sort((a, b) =>
        b.period_start.localeCompare(a.period_start),
      );

      return settle(page(sorted));
    },

    get(id) {
      currentUser();

      const engagement = engagements.find((candidate) => candidate.id === id);
      if (!engagement) throw new ApiError("Not found.", 404);

      return settle(engagement);
    },

    create(input) {
      const user = currentUser();
      requireManager(user, "create engagements");

      const client = clients.find((candidate) => candidate.id === input.client);
      if (!client) throw new ApiError("That client does not exist.", 400);

      const service = services.find(
        (candidate) => candidate.id === input.service_type,
      );
      if (!service) throw new ApiError("That service does not exist.", 400);

      validatePeriod(service, input.period_start, input.period_end);

      // The real guarantee is UNIQUE(client, service, period_start, period_end);
      // this is the same rule, enforced where the mock keeps its rows.
      const duplicate = engagements.some(
        (item) =>
          item.client === input.client &&
          item.service_type === input.service_type &&
          item.period_start === input.period_start &&
          item.period_end === input.period_end,
      );

      if (duplicate) {
        throw new ApiError(
          "An engagement already exists for this client, service and period.",
          409,
        );
      }

      const now = new Date().toISOString();
      const engagement: Engagement = {
        id: Math.max(...engagements.map((candidate) => candidate.id)) + 1,
        client: client.id,
        client_name: client.name,
        service_type: service.id,
        service_name: service.name,
        frequency: service.frequency,
        period_start: input.period_start,
        period_end: input.period_end,
        status: "ACTIVE",
        created_by_id: user.id,
        created_at: now,
        updated_at: now,
      };

      engagements.push(engagement);

      // Stands in for the worker consuming ENGAGEMENT_CREATED.
      generateTasks(engagement);

      return settle(engagement);
    },

    setStatus(id, status) {
      const user = currentUser();
      requireManager(user, "manage engagements");

      const engagement = engagements.find((candidate) => candidate.id === id);
      if (!engagement) throw new ApiError("Not found.", 404);

      engagement.status = status;
      engagement.updated_at = new Date().toISOString();

      return settle(engagement);
    },
  },

  tasks: {
    list(filters = {}) {
      const user = currentUser();
      let results = visibleTo(user);

      if (filters.mine) {
        results = results.filter((task) => task.assigned_to_id === user.id);
      }
      if (filters.status?.length) {
        results = results.filter((task) => filters.status!.includes(task.status));
      }
      if (filters.engagement_id) {
        results = results.filter(
          (task) => task.engagement_id === filters.engagement_id,
        );
      }
      if (filters.assigned_to_id) {
        results = results.filter(
          (task) => task.assigned_to_id === filters.assigned_to_id,
        );
      }
      if (filters.due_before) {
        results = results.filter((task) => task.due_date <= filters.due_before!);
      }
      if (filters.due_after) {
        results = results.filter((task) => task.due_date >= filters.due_after!);
      }

      const sorted = [...results].sort(
        (a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id,
      );

      // Cursor pagination, like the real list - the offset rides in the cursor
      // so the UI never learns to think in page numbers.
      const size = filters.page_size ?? 50;
      const start = filters.cursor ? Number(atob(filters.cursor)) : 0;
      const slice = sorted.slice(start, start + size);
      const end = start + slice.length;

      const result: CursorPage<Task> = {
        results: slice.map((task) => withTransitions(task, user)),
        next: end < sorted.length ? btoa(String(end)) : null,
        previous: start > 0 ? btoa(String(Math.max(0, start - size))) : null,
      };

      return settle(result);
    },

    get(id) {
      const user = currentUser();
      const task = findTask(id, user);

      const detail: TaskDetail = {
        ...withTransitions(task, user),
        history: [...(historyByTask.get(task.id) ?? [])].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      };

      return settle(detail);
    },

    dashboard() {
      const user = currentUser();
      const scope = visibleTo(user);
      const today = new Date().toISOString().slice(0, 10);

      const by_status = Object.fromEntries(
        TASK_STATUSES.map((status) => [
          status,
          scope.filter((task) => task.status === status).length,
        ]),
      ) as Record<TaskStatus, number>;

      const open = scope.filter((task) => task.status !== "COMPLETED");

      const summary: DashboardSummary = {
        open_tasks: open.length,
        overdue: open.filter((task) => task.due_date < today).length,
        due_today: open.filter((task) => task.due_date === today).length,
        waiting_for_client: by_status.WAITING_FOR_CLIENT,
        waiting_for_review: by_status.READY_FOR_REVIEW,
        completed: by_status.COMPLETED,
        total: scope.length,
        by_status,
      };

      return settle(summary);
    },

    changeStatus(id, input) {
      const user = currentUser();
      const task = findTask(id, user);

      return settle(applyTransition(task, input.status, user, input.comment ?? ""));
    },

    assign(id, assignedToId) {
      const user = currentUser();
      requireManager(user, "assign tasks");

      const task = findTask(id, user);

      if (assignedToId !== null && !users.some((c) => c.id === assignedToId)) {
        throw new ApiError("That user does not exist.", 400);
      }

      task.assigned_to_id = assignedToId;
      task.updated_at = new Date().toISOString();

      return settle(withTransitions(task, user));
    },

    setDueDate(id, dueDate) {
      const user = currentUser();
      requireManager(user, "set deadlines");

      const task = findTask(id, user);

      task.due_date = dueDate;
      task.updated_at = new Date().toISOString();

      return settle(withTransitions(task, user));
    },

    approve(id, comment = "") {
      const user = currentUser();
      const task = findTask(id, user);

      return settle(applyTransition(task, "COMPLETED", user, comment));
    },

    requestChanges(id, comment) {
      const user = currentUser();
      const task = findTask(id, user);

      if (!comment.trim()) {
        throw new ApiError("A comment is required when requesting changes.", 400);
      }

      return settle(applyTransition(task, "CHANGES_REQUESTED", user, comment));
    },
  },
};
