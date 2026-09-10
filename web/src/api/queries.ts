import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { api } from ".";
import type {
  ChangeStatusInput,
  CreateClientInput,
  CreateEngagementInput,
  CreateServiceTypeInput,
  CreateUserInput,
  EngagementFilters,
  TaskFilters,
  User,
} from "./types";

/* ---------------------------------------------------------------------------
   Query keys and hooks.

   One key factory so an invalidation can never drift from the query it is
   meant to refresh. Reference data (users, clients, services) is cached hard,
   because it changes far less often than the tasks laid over it.
--------------------------------------------------------------------------- */

export const keys = {
  me: ["me"] as const,
  users: (params?: object) => ["users", params ?? {}] as const,
  clients: (params?: object) => ["clients", params ?? {}] as const,
  services: () => ["services"] as const,
  templates: (serviceTypeId?: number) => ["templates", serviceTypeId ?? null] as const,
  engagements: (filters?: EngagementFilters) => ["engagements", filters ?? {}] as const,
  engagement: (id: number) => ["engagement", id] as const,
  tasks: (filters?: TaskFilters) => ["tasks", filters ?? {}] as const,
  task: (id: number) => ["task", id] as const,
  dashboard: () => ["dashboard"] as const,
};

/** Reference data barely moves; don't refetch it on every mount. */
const REFERENCE = { staleTime: 5 * 60_000 };

/* --- reads --------------------------------------------------------------- */

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.auth.me() });
}

export function useUsers(params?: { role?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: keys.users(params),
    queryFn: () => api.users.list(params),
    ...REFERENCE,
  });
}

/**
 * Resolve `assigned_to_id` and friends to a user.
 *
 * The services own separate databases and never join across that boundary, so
 * tasks carry ids and the UI does the joining.
 */
export function useUserLookup() {
  const { data, isPending } = useUsers();
  const users = data?.results;

  const lookup = useCallback(
    (id: number | null | undefined): User | undefined =>
      id == null ? undefined : users?.find((user) => user.id === id),
    [users],
  );

  return { lookup, users: users ?? [], isPending };
}

export function useClients(params?: { search?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: keys.clients(params),
    queryFn: () => api.clients.list(params),
    ...REFERENCE,
  });
}

export function useServices() {
  return useQuery({
    queryKey: keys.services(),
    queryFn: () => api.services.list(),
    ...REFERENCE,
  });
}

export function useTemplates(serviceTypeId?: number) {
  return useQuery({
    queryKey: keys.templates(serviceTypeId),
    queryFn: () => api.services.templates(serviceTypeId),
    ...REFERENCE,
  });
}

export function useEngagements(filters?: EngagementFilters) {
  return useQuery({
    queryKey: keys.engagements(filters),
    queryFn: () => api.engagements.list(filters),
  });
}

export function useEngagement(id: number) {
  return useQuery({
    queryKey: keys.engagement(id),
    queryFn: () => api.engagements.get(id),
    enabled: Number.isFinite(id),
  });
}

/** Engagement id -> engagement, for task rows that only carry the id. */
export function useEngagementLookup() {
  const { data } = useEngagements();
  const engagements = data?.results;

  const lookup = useCallback(
    (id: number) => engagements?.find((engagement) => engagement.id === id),
    [engagements],
  );

  return { lookup, engagements: engagements ?? [] };
}

/** The task list is cursor paginated, so it pages forward and never jumps. */
export function useTasks(filters: TaskFilters) {
  return useInfiniteQuery({
    queryKey: keys.tasks(filters),
    queryFn: ({ pageParam }) =>
      api.tasks.list({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: keys.task(id),
    queryFn: () => api.tasks.get(id),
    enabled: Number.isFinite(id),
  });
}

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard(), queryFn: () => api.tasks.dashboard() });
}

/* --- writes -------------------------------------------------------------- */

/**
 * Anything that touches a task moves a counter and may move a board column,
 * so a task write refreshes the list, the open detail and the dashboard.
 *
 * No optimistic update: the server owns the workflow, and guessing its answer
 * would mean rendering a transition it might reject.
 */
const invalidateTasks = (client: QueryClient) => {
  void client.invalidateQueries({ queryKey: ["tasks"] });
  void client.invalidateQueries({ queryKey: ["task"] });
  void client.invalidateQueries({ queryKey: ["dashboard"] });
};

export function useChangeStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChangeStatusInput }) =>
      api.tasks.changeStatus(id, input),
    onSuccess: () => invalidateTasks(client),
  });
}

export function useApprove() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
      api.tasks.approve(id, comment),
    onSuccess: () => invalidateTasks(client),
  });
}

export function useRequestChanges() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      api.tasks.requestChanges(id, comment),
    onSuccess: () => invalidateTasks(client),
  });
}

export function useAssign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedToId }: { id: number; assignedToId: number | null }) =>
      api.tasks.assign(id, assignedToId),
    onSuccess: () => invalidateTasks(client),
  });
}

export function useSetDueDate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: number; dueDate: string }) =>
      api.tasks.setDueDate(id, dueDate),
    onSuccess: () => invalidateTasks(client),
  });
}

export function useCreateEngagement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEngagementInput) => api.engagements.create(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["engagements"] });
      // Creating an engagement generates its tasks, so the board moves too.
      invalidateTasks(client);
    },
  });
}

export function useCreateClient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) => api.clients.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateClientInput> }) =>
      api.clients.update(id, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useCreateService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceTypeInput) => api.services.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.users.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["users"] }),
  });
}
