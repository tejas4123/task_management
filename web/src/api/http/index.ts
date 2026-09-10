import { query, request } from "../client";
import type { ApiAdapter } from "../adapter";
import { tokenStore } from "../tokens";
import type {
  Client,
  CursorPage,
  DashboardSummary,
  Engagement,
  LoginResponse,
  Paginated,
  ServiceType,
  Task,
  TaskDetail,
  TaskTemplate,
  User,
} from "../types";

/** Talks to the four Django services. Selected when VITE_USE_MOCK=false. */
export const httpApi: ApiAdapter = {
  auth: {
    async login(username, password) {
      const data = await request<LoginResponse>("auth", "/api/v1/auth/login/", {
        method: "POST",
        body: { username, password },
        anonymous: true,
      });
      tokenStore.set(data.access, data.refresh);
      return data;
    },
    me: () => request<User>("auth", "/api/v1/auth/me/"),
  },

  users: {
    list: (params = {}) =>
      request<Paginated<User>>("auth", `/api/v1/users/${query(params)}`),
    create: (input) =>
      request<User>("auth", "/api/v1/users/", { method: "POST", body: input }),
    deactivate: (id) =>
      request<void>("auth", `/api/v1/users/${id}/`, { method: "DELETE" }),
  },

  clients: {
    list: (params = {}) =>
      request<Paginated<Client>>("engagement", `/api/v1/clients/${query(params)}`),
    create: (input) =>
      request<Client>("engagement", "/api/v1/clients/", {
        method: "POST",
        body: input,
      }),
    update: (id, input) =>
      request<Client>("engagement", `/api/v1/clients/${id}/`, {
        method: "PATCH",
        body: input,
      }),
    deactivate: (id) =>
      request<void>("engagement", `/api/v1/clients/${id}/`, { method: "DELETE" }),
  },

  services: {
    list: () => request<Paginated<ServiceType>>("engagement", "/api/v1/services/"),
    create: (input) =>
      request<ServiceType>("engagement", "/api/v1/services/", {
        method: "POST",
        body: input,
      }),
    templates: (serviceTypeId) =>
      request<Paginated<TaskTemplate>>(
        "engagement",
        `/api/v1/templates/${query({ service_type: serviceTypeId, page_size: 200 })}`,
      ),
  },

  engagements: {
    list: (filters = {}) =>
      request<Paginated<Engagement>>(
        "engagement",
        `/api/v1/engagements/${query(filters)}`,
      ),
    get: (id) => request<Engagement>("engagement", `/api/v1/engagements/${id}/`),
    create: (input) =>
      request<Engagement>("engagement", "/api/v1/engagements/", {
        method: "POST",
        body: input,
      }),
    setStatus: (id, status) =>
      request<Engagement>("engagement", `/api/v1/engagements/${id}/status/`, {
        method: "POST",
        body: { status },
      }),
  },

  tasks: {
    list: (filters = {}) =>
      request<CursorPage<Task>>("task", `/api/v1/tasks/${query({ ...filters })}`),
    get: (id) => request<TaskDetail>("task", `/api/v1/tasks/${id}/`),
    dashboard: () => request<DashboardSummary>("task", "/api/v1/tasks/dashboard/"),
    changeStatus: (id, input) =>
      request<Task>("task", `/api/v1/tasks/${id}/status/`, {
        method: "POST",
        body: input,
      }),
    assign: (id, assignedToId) =>
      request<Task>("task", `/api/v1/tasks/${id}/assign/`, {
        method: "POST",
        body: { assigned_to_id: assignedToId },
      }),
    setDueDate: (id, dueDate) =>
      request<Task>("task", `/api/v1/tasks/${id}/due-date/`, {
        method: "POST",
        body: { due_date: dueDate },
      }),
    approve: (id, comment = "") =>
      request<Task>("task", `/api/v1/tasks/${id}/approve/`, {
        method: "POST",
        body: { comment },
      }),
    requestChanges: (id, comment) =>
      request<Task>("task", `/api/v1/tasks/${id}/request-changes/`, {
        method: "POST",
        body: { comment },
      }),
  },
};
