export type Role = "ADMIN" | "MANAGER" | "TEAM_MEMBER";

export type TaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "WAITING_FOR_CLIENT"
  | "READY_FOR_REVIEW"
  | "CHANGES_REQUESTED"
  | "COMPLETED";

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  created_at?: string;
}

export type Frequency = "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface ServiceType {
  id: number;
  name: string;
  description: string;
  frequency: Frequency;
  is_recurring: boolean;
  created_at?: string;
}

export interface TaskTemplate {
  id: number;
  service_type: number;
  service_name: string;
  title: string;
  description: string;
  sequence: number;
  default_due_days: number;
  created_at?: string;
}

export type EngagementStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

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
  created_at?: string;
  updated_at?: string;
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
  created_by_type: "USER" | "SYSTEM";
  due_date: string;
  status: TaskStatus;
  /** Supplied by the backend workflow map - the UI never derives these itself. */
  allowed_transitions: TaskStatus[];
  completed_at: string | null;
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

export interface Paginated<T> {
  results: T[];
  next: string | null;
  previous: string | null;
  count?: number;
}
