import type {
  ChangeStatusInput,
  Client,
  CreateClientInput,
  CreateEngagementInput,
  CreateServiceTypeInput,
  CreateUserInput,
  CursorPage,
  DashboardSummary,
  Engagement,
  EngagementFilters,
  EngagementStatus,
  LoginResponse,
  Paginated,
  ServiceType,
  Task,
  TaskDetail,
  TaskFilters,
  TaskTemplate,
  User,
} from "./types";

/**
 * The whole surface the UI is allowed to use.
 *
 * Components import `api` (see ./index.ts) and nothing else - no component
 * calls `fetch`. Swapping the mock for the real services is a one-line change
 * because both satisfy this interface.
 */
export interface ApiAdapter {
  auth: {
    login(username: string, password: string): Promise<LoginResponse>;
    me(): Promise<User>;
  };

  users: {
    list(params?: { role?: string; is_active?: boolean }): Promise<Paginated<User>>;
    create(input: CreateUserInput): Promise<User>;
    deactivate(id: number): Promise<void>;
  };

  clients: {
    list(params?: { search?: string; is_active?: boolean }): Promise<Paginated<Client>>;
    create(input: CreateClientInput): Promise<Client>;
    update(id: number, input: Partial<CreateClientInput>): Promise<Client>;
    deactivate(id: number): Promise<void>;
  };

  services: {
    list(): Promise<Paginated<ServiceType>>;
    create(input: CreateServiceTypeInput): Promise<ServiceType>;
    templates(serviceTypeId?: number): Promise<Paginated<TaskTemplate>>;
  };

  engagements: {
    list(filters?: EngagementFilters): Promise<Paginated<Engagement>>;
    get(id: number): Promise<Engagement>;
    create(input: CreateEngagementInput): Promise<Engagement>;
    setStatus(id: number, status: EngagementStatus): Promise<Engagement>;
  };

  tasks: {
    list(filters?: TaskFilters): Promise<CursorPage<Task>>;
    get(id: number): Promise<TaskDetail>;
    dashboard(): Promise<DashboardSummary>;
    changeStatus(id: number, input: ChangeStatusInput): Promise<Task>;
    assign(id: number, assignedToId: number | null): Promise<Task>;
    setDueDate(id: number, dueDate: string): Promise<Task>;
    approve(id: number, comment?: string): Promise<Task>;
    requestChanges(id: number, comment: string): Promise<Task>;
  };
}
