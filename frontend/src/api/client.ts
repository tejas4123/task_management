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

/**
 * Fallbacks for statuses where the backend has no useful `detail` to show.
 * A body message always wins - the services phrase their own domain errors
 * ("Cannot transition from NOT_STARTED to COMPLETED") far better than a
 * generic sentence keyed off the status code.
 */
const STATUS_FALLBACK: Record<number, string> = {
  403: "You do not have permission to perform this action.",
  404: "The requested item could not be found.",
  409: "That conflicts with something that already exists.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again.",
  502: "The service is unavailable. Please try again shortly.",
  503: "The service is unavailable. Please try again shortly.",
  504: "The service took too long to respond. Please try again.",
};

function messageFor(status: number, payload: unknown): string {
  const detail = readDetail(payload);
  if (detail !== "Something went wrong.") return detail;
  return STATUS_FALLBACK[status] ?? "Something went wrong.";
}

let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/**
 * In-flight refresh, shared by every caller.
 *
 * A page that fires three requests at once gets three 401s the moment the
 * access token expires. Without this they would race, and two of the three
 * refresh calls would present an already-rotated token. They all await the
 * same promise instead, and exactly one hits the Auth Service.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;

  const response = await fetch(`${AUTH_URL}/api/v1/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as { access?: string } | null;
  if (!payload?.access) return null;

  localStorage.setItem(TOKEN_KEY, payload.access);
  return payload.access;
}

function refreshOnce(): Promise<string | null> {
  refreshInFlight ??= refreshAccessToken()
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function send(service: Service, path: string, init: RequestInit, token: string | null) {
  return fetch(`${BASE[service]}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

export async function request<T>(
  service: Service,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await send(service, path, init, localStorage.getItem(TOKEN_KEY));
  } catch {
    // fetch only rejects on a transport failure - DNS, refused connection,
    // offline. A 500 is a resolved promise, so this really is "unreachable".
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      0,
    );
  }

  // The access token lives 30 minutes; the refresh token lives 7 days. Trade
  // one in and replay the request before giving up on the session.
  if (response.status === 401) {
    const token = await refreshOnce();

    if (!token) {
      onUnauthorized();
      throw new ApiError("Your session has expired. Please sign in again.", 401);
    }

    try {
      response = await send(service, path, init, token);
    } catch {
      throw new ApiError(
        "Could not reach the server. Check your connection and try again.",
        0,
      );
    }

    if (response.status === 401) {
      onUnauthorized();
      throw new ApiError("Your session has expired. Please sign in again.", 401);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(messageFor(response.status, payload), response.status);
  }

  return payload as T;
}

export const get = <T>(service: Service, path: string) => request<T>(service, path);

export const post = <T>(service: Service, path: string, body?: unknown) =>
  request<T>(service, path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const patch = <T>(service: Service, path: string, body: unknown) =>
  request<T>(service, path, { method: "PATCH", body: JSON.stringify(body) });

/** `delete` is a reserved word, so the helper is named for what it does. */
export const remove = <T>(service: Service, path: string) =>
  request<T>(service, path, { method: "DELETE" });
