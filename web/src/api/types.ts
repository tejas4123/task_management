/* ---------------------------------------------------------------------------
   Domain types.

   These mirror the four backend services. Cross-service references are plain
   ids (`assigned_to_id`, `engagement_id`) because the services own separate
   databases and never join across that boundary - the UI resolves ids to
   names itself.
--------------------------------------------------------------------------- */

export type Role = "ADMIN" | "MANAGER" | "TEAM_MEMBER";

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING_FOR_CLIENT",
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "COMPLETED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Frequency = "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export type EngagementStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export type CreatorType = "USER" | "SYSTEM";

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceType {
  id: number;
  name: string;
  description: string;
  frequency: Frequency;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplate {
  id: number;
  service_type: number;
  service_name: string;
  title: string;
  description: string;
  sequence: number;
  /** Days after the engagement's period_start that the generated task is due. */
  default_due_days: number;
  created_at: string;
  updated_at: string;
}

export interface Engagement {
  id: number;
  client: number;
  client_name: string;
  service_type: number;
  service_name: string;
  frequency: Frequency;
  period_start: string;
  period_end: string;
  status: EngagementStatus;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

export interface TaskHistoryEntry {
  id: number;
  from_status: TaskStatus;
  to_status: TaskStatus;
  changed_by_id: number;
  comment: string;
  created_at: string;
}

export interface Task {
  id: number;
  engagement_id: number;
  template_id: number;
  title: string;
  description: string;
  assigned_to_id: number | null;
  created_by_id: number | null;
  created_by_type: CreatorType;
  due_date: string;
  status: TaskStatus;
  /**
   * Supplied by the backend's workflow map. The UI renders only these actions;
   * it never derives reachable states itself, and the server re-checks anyway.
   */
  allowed_transitions: TaskStatus[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends Task {
  history: TaskHistoryEntry[];
}

export interface DashboardSummary {
  open_tasks: number;
  overdue: number;
  due_today: number;
  waiting_for_client: number;
  waiting_for_review: number;
  completed: number;
  total: number;
  by_status: Record<TaskStatus, number>;
}

/* --- transport ----------------------------------------------------------- */

/** Page-number pagination (clients, services, users, engagements). */
export interface Paginated<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

/** Cursor pagination (tasks - the list that has to scale). */
export interface CursorPage<T> {
  results: T[];
  next: string | null;
  previous: string | null;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface LoginResponse extends TokenPair {
  user: User;
}

/** The claims the Auth Service puts in the access token. */
export interface JwtClaims {
  user_id: number;
  role: Role;
  email?: string;
  username?: string;
  exp: number;
  iat?: number;
}

/* --- query parameters ---------------------------------------------------- */

export interface TaskFilters {
  status?: TaskStatus[];
  engagement_id?: number;
  assigned_to_id?: number;
  mine?: boolean;
  due_before?: string;
  due_after?: string;
  cursor?: string;
  page_size?: number;
}

export interface EngagementFilters {
  client?: number;
  service_type?: number;
  status?: EngagementStatus;
  page?: number;
}

export interface CreateEngagementInput {
  client: number;
  service_type: number;
  period_start: string;
  period_end: string;
}

export interface CreateClientInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface CreateServiceTypeInput {
  name: string;
  description?: string;
  frequency: Frequency;
}

export interface CreateUserInput {
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: Role;
  password: string;
}

export interface ChangeStatusInput {
  status: TaskStatus;
  comment?: string;
}
