/** Runtime configuration, read once from Vite's env. */

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : value.trim().toLowerCase() === "true";

export const config = {
  /** Mock adapter is the default so the app runs with no backend at all. */
  useMock: flag(import.meta.env.VITE_USE_MOCK, true),
  authUrl: import.meta.env.VITE_AUTH_URL ?? "http://localhost:8001",
  engagementUrl: import.meta.env.VITE_ENGAGEMENT_URL ?? "http://localhost:8002",
  taskUrl: import.meta.env.VITE_TASK_URL ?? "http://localhost:8003",
} as const;

export const STORAGE_KEYS = {
  access: "tm.access",
  refresh: "tm.refresh",
  theme: "tm.theme",
  sidebar: "tm.sidebar",
} as const;
