/**
 * Thin fetch wrapper for the three backend services.
 *
 * The access token is attached to every call and a 401 clears the session.
 * Nothing here decides what a user may do - the backend answers 403 and the UI
 * shows the message.
 */

const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? "http://localhost:8001";
const ENGAGEMENT_URL = import.meta.env.VITE_ENGAGEMENT_URL ?? "http://localhost:8002";
const TASK_URL = import.meta.env.VITE_TASK_URL ?? "http://localhost:8003";

export const TOKEN_KEY = "tm.access";
export const REFRESH_KEY = "tm.refresh";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Service = "auth" | "engagement" | "task";

const BASE: Record<Service, string> = {
  auth: AUTH_URL,
  engagement: ENGAGEMENT_URL,
  task: TASK_URL,
};

function readDetail(payload: unknown): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      return Object.entries(detail)
        .map(([field, messages]) => `${field}: ${[messages].flat().join(", ")}`)
        .join(" | ");
    }
  }
  return "Something went wrong.";
}

let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export async function request<T>(
  service: Service,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);

  const response = await fetch(`${BASE[service]}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(readDetail(payload), response.status);
  }

  return payload as T;
}

export const get = <T>(service: Service, path: string) => request<T>(service, path);

export const post = <T>(service: Service, path: string, body?: unknown) =>
  request<T>(service, path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const patch = <T>(service: Service, path: string, body: unknown) =>
  request<T>(service, path, { method: "PATCH", body: JSON.stringify(body) });
