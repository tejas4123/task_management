import type {
  Client,
  Engagement,
  ServiceType,
  Task,
  TaskHistoryEntry,
  TaskTemplate,
  User,
} from "../types";

/* ---------------------------------------------------------------------------
   Deterministic seed data.

   A fixed PRNG keeps the dataset identical between reloads, so the preview
   looks the same every time and screenshots stay comparable.
--------------------------------------------------------------------------- */

function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260910);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)];

/** "Today" for the mock. Fixed so overdue/due-today counts are stable. */
export const MOCK_TODAY = new Date("2026-09-10T09:00:00Z");

const iso = (date: Date) => date.toISOString();
const day = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86_400_000);

const CREATED_AT = iso(addDays(MOCK_TODAY, -45));

/* --- users --------------------------------------------------------------- */

const USER_SEED: Array<[string, string, string, User["role"]]> = [
  ["admin", "Aditi", "Rao", "ADMIN"],
  ["manager1", "Manish", "Kulkarni", "MANAGER"],
  ["manager2", "Meera", "Iyer", "MANAGER"],
  ["member1", "Rohit", "Sharma", "TEAM_MEMBER"],
  ["member2", "Priya", "Nair", "TEAM_MEMBER"],
  ["member3", "Karan", "Mehta", "TEAM_MEMBER"],
  ["member4", "Sneha", "Patil", "TEAM_MEMBER"],
];

export const users: User[] = USER_SEED.map(
  ([username, first, last, role], index) => ({
    id: index + 1,
    username,
    email: `${username}@example.com`,
    first_name: first,
    last_name: last,
    role,
    is_active: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  }),
);

export const DEMO_PASSWORD = "Password123!";

/* --- clients ------------------------------------------------------------- */

const CLIENT_SEED: Array<[string, string, string]> = [
  ["Northwind Traders", "accounts@northwind.example", "+91 98000 00001"],
  ["Umbrella Logistics", "finance@umbrella.example", "+91 98000 00002"],
  ["Sunrise Textiles", "admin@sunrise.example", "+91 98000 00003"],
  ["Blue Harbour Foods", "billing@blueharbour.example", "+91 98000 00004"],
  ["Kestrel Analytics", "ops@kestrel.example", "+91 98000 00005"],
  ["Meridian Pharma", "accounts@meridian.example", "+91 98000 00006"],
];

export const clients: Client[] = CLIENT_SEED.map(([name, email, phone], index) => ({
  id: index + 1,
  name,
  email,
  phone,
  is_active: true,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
}));

/* --- services and templates ---------------------------------------------- */

const SERVICE_SEED: Array<{
  name: string;
  description: string;
  frequency: ServiceType["frequency"];
  steps: Array<[string, number]>;
}> = [
  {
    name: "Monthly GST Compliance",
    description: "Monthly GST return preparation, reconciliation and filing.",
    frequency: "MONTHLY",
    steps: [
      ["Collect sales and purchase registers", 3],
      ["Reconcile GSTR-2B with purchase register", 7],
      ["Prepare GSTR-1", 10],
      ["Prepare GSTR-3B and compute liability", 15],
      ["File returns and share acknowledgement", 20],
    ],
  },
  {
    name: "GST Registration",
    description: "New GST registration for a client entity.",
    frequency: "ONE_TIME",
    steps: [
      ["Collect KYC and constitution documents", 3],
      ["Verify principal place of business proof", 6],
      ["Submit REG-01 application", 10],
      ["Respond to departmental queries", 20],
    ],
  },
  {
    name: "GST Refund",
    description: "Quarterly refund application for exporters.",
    frequency: "QUARTERLY",
    steps: [
      ["Compile export invoices and shipping bills", 10],
      ["Compute refund eligibility", 20],
      ["File RFD-01", 30],
      ["Track refund sanction", 45],
    ],
  },
  {
    name: "Annual Audit Support",
    description: "Year-end audit assistance and schedule preparation.",
    frequency: "YEARLY",
    steps: [
      ["Prepare trial balance and schedules", 30],
      ["Draft financial statements", 60],
      ["Resolve auditor observations", 90],
      ["File the annual return", 120],
    ],
  },
];

export const services: ServiceType[] = SERVICE_SEED.map((service, index) => ({
  id: index + 1,
  name: service.name,
  description: service.description,
  frequency: service.frequency,
  is_recurring: service.frequency !== "ONE_TIME",
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
}));

export const templates: TaskTemplate[] = SERVICE_SEED.flatMap(
  (service, serviceIndex) =>
    service.steps.map(([title, dueDays], stepIndex) => ({
      id: serviceIndex * 100 + stepIndex + 1,
      service_type: serviceIndex + 1,
      service_name: service.name,
      title,
      description: "",
      sequence: stepIndex + 1,
      default_due_days: dueDays,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    })),
);

/* --- engagements --------------------------------------------------------- */

const lastDayOf = (year: number, month: number) => new Date(year, month + 1, 0);

const monthPeriod = (year: number, month: number) => ({
  period_start: day(new Date(Date.UTC(year, month, 1))),
  period_end: day(new Date(Date.UTC(year, month, lastDayOf(year, month).getDate()))),
});

const quarterPeriod = (year: number, startMonth: number) => ({
  period_start: day(new Date(Date.UTC(year, startMonth, 1))),
  period_end: day(
    new Date(
      Date.UTC(year, startMonth + 2, lastDayOf(year, startMonth + 2).getDate()),
    ),
  ),
});

interface EngagementSeed {
  client: number;
  service: number;
  period: { period_start: string; period_end: string };
  status?: Engagement["status"];
}

const ENGAGEMENT_SEED: EngagementSeed[] = [
  // August 2026 monthly compliance - a closed period, so it has been rolled forward.
  { client: 1, service: 1, period: monthPeriod(2026, 7), status: "COMPLETED" },
  { client: 2, service: 1, period: monthPeriod(2026, 7), status: "COMPLETED" },
  { client: 3, service: 1, period: monthPeriod(2026, 7), status: "COMPLETED" },
  // September 2026 - the open period, generated from the August engagements.
  { client: 1, service: 1, period: monthPeriod(2026, 8) },
  { client: 2, service: 1, period: monthPeriod(2026, 8) },
  { client: 3, service: 1, period: monthPeriod(2026, 8) },
  { client: 4, service: 1, period: monthPeriod(2026, 8) },
  { client: 5, service: 1, period: monthPeriod(2026, 8) },
  // Quarterly refunds.
  { client: 2, service: 3, period: quarterPeriod(2026, 3), status: "COMPLETED" },
  { client: 2, service: 3, period: quarterPeriod(2026, 6) },
  // One-off registration and a yearly audit.
  { client: 6, service: 2, period: monthPeriod(2026, 8) },
  {
    client: 4,
    service: 4,
    period: { period_start: "2026-04-01", period_end: "2027-03-31" },
  },
];

export const engagements: Engagement[] = ENGAGEMENT_SEED.map((seed, index) => {
  const client = clients[seed.client - 1];
  const service = services[seed.service - 1];

  return {
    id: index + 1,
    client: client.id,
    client_name: client.name,
    service_type: service.id,
    service_name: service.name,
    frequency: service.frequency,
    period_start: seed.period.period_start,
    period_end: seed.period.period_end,
    status: seed.status ?? "ACTIVE",
    created_by_id: pick([2, 3]),
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
});

/* --- tasks --------------------------------------------------------------- */

const MEMBER_IDS = users.filter((u) => u.role === "TEAM_MEMBER").map((u) => u.id);

/** Statuses a task in a closed vs open period plausibly sits in. */
const CLOSED_PERIOD_STATUSES: Task["status"][] = [
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "READY_FOR_REVIEW",
];

const OPEN_PERIOD_STATUSES: Task["status"][] = [
  "NOT_STARTED",
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_PROGRESS",
  "WAITING_FOR_CLIENT",
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "COMPLETED",
];

export const tasks: Task[] = [];
export const history: TaskHistoryEntry[] = [];

let taskId = 0;
let historyId = 0;

function record(
  task: Task,
  from: Task["status"],
  to: Task["status"],
  changedBy: number,
  comment: string,
  at: Date,
) {
  history.push({
    id: ++historyId,
    from_status: from,
    to_status: to,
    changed_by_id: changedBy,
    comment,
    created_at: iso(at),
  });
  void task;
}

/** Replay the workflow so every task's history is consistent with its status. */
const PATH: Record<Task["status"], Task["status"][]> = {
  NOT_STARTED: [],
  IN_PROGRESS: ["IN_PROGRESS"],
  WAITING_FOR_CLIENT: ["IN_PROGRESS", "WAITING_FOR_CLIENT"],
  READY_FOR_REVIEW: ["IN_PROGRESS", "READY_FOR_REVIEW"],
  CHANGES_REQUESTED: ["IN_PROGRESS", "READY_FOR_REVIEW", "CHANGES_REQUESTED"],
  COMPLETED: ["IN_PROGRESS", "READY_FOR_REVIEW", "COMPLETED"],
};

const COMMENTS: Partial<Record<Task["status"], string[]>> = {
  WAITING_FOR_CLIENT: [
    "Awaiting the purchase register from the client.",
    "Client has not shared the bank statement yet.",
  ],
  READY_FOR_REVIEW: ["Ready for your review.", "Reconciliation attached."],
  CHANGES_REQUESTED: [
    "Reconciliation is missing March. Please redo.",
    "Please attach the challan before resubmitting.",
  ],
  COMPLETED: ["Approved.", "Looks good - filed."],
};

for (const engagement of engagements) {
  const serviceTemplates = templates.filter(
    (t) => t.service_type === engagement.service_type,
  );
  const periodStart = new Date(`${engagement.period_start}T00:00:00Z`);
  const isClosed = new Date(`${engagement.period_end}T00:00:00Z`) < MOCK_TODAY;

  for (const template of serviceTemplates) {
    const status = isClosed
      ? pick(CLOSED_PERIOD_STATUSES)
      : pick(OPEN_PERIOD_STATUSES);

    const dueDate = addDays(periodStart, template.default_due_days);
    const createdAt = addDays(periodStart, -2);

    const task: Task = {
      id: ++taskId,
      engagement_id: engagement.id,
      template_id: template.id,
      title: template.title,
      description: `${engagement.client_name} · ${engagement.service_name} · ${engagement.period_start} to ${engagement.period_end}`,
      assigned_to_id: MEMBER_IDS[taskId % MEMBER_IDS.length],
      created_by_id: null,
      created_by_type: "SYSTEM",
      due_date: day(dueDate),
      status,
      allowed_transitions: [],
      completed_at: null,
      created_at: iso(createdAt),
      updated_at: iso(createdAt),
    };

    let previous: Task["status"] = "NOT_STARTED";
    let at = addDays(createdAt, 1);

    for (const step of PATH[status]) {
      const reviewer = step === "COMPLETED" || step === "CHANGES_REQUESTED";
      const actor = reviewer ? pick([2, 3]) : task.assigned_to_id!;
      const options = COMMENTS[step];

      record(task, previous, step, actor, options ? pick(options) : "", at);

      previous = step;
      at = addDays(at, 1);
    }

    if (status === "COMPLETED") {
      task.completed_at = iso(at);
      task.updated_at = iso(at);
    }

    tasks.push(task);
  }
}

/** Ids of the history rows that belong to a task, in creation order. */
export const historyByTask = new Map<number, TaskHistoryEntry[]>();

{
  // Re-walk the tasks to attach history, since `record` runs before ids settle.
  let cursor = 0;
  for (const task of tasks) {
    const count = PATH[task.status].length;
    historyByTask.set(task.id, history.slice(cursor, cursor + count));
    cursor += count;
  }
}
