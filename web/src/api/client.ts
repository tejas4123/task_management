import { config } from "./config";
import { ApiError, parseError } from "./errors";
import { tokenStore } from "./tokens";
import type { TokenPair } from "./types";

/* ---------------------------------------------------------------------------
   The HTTP client.

   Attaches the bearer token, and on a 401 refreshes exactly once before
   retrying. Concurrent 401s share a single refresh (otherwise ten parallel
   queries would fire ten refreshes and rotate each other's tokens). If the
   refresh fails, the session is cleared and the app is sent to /login.
--------------------------------------------------------------------------- */

export type Service = "auth" | "engagement" | "task";

const BASE: Record<Service, string> = {
  auth: config.authUrl,
  engagement: config.engagementUrl,
  task: config.taskUrl,
};

/** Set by the app so the client can navigate without importing the router. */
let onSessionExpired: () => void = () => {
  if (typeof window !== "undefined") window.location.assign("/login");
};

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

/** In-flight refresh, shared by every request that hits a 401 at once. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.refresh();
  if (!refresh) return null;

  try {
    const response = await fetch(`${BASE.auth}/api/v1/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!response.ok) return null;

    const tokens = (await response.json()) as Partial<TokenPair>;
    if (!tokens.access) return null;

    // Some deployments rotate the refresh token too; keep it if sent.
    tokenStore.set(tokens.access, tokens.refresh);
    return tokens.access;
  } catch {
    return null;
  }
}

function refreshOnce(): Promise<string | null> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header - used by login and health. */
  anonymous?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function send(
  service: Service,
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token && !options.anonymous) headers.Authorization = `Bearer ${token}`;

  return fetch(`${BASE[service]}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

export async function request<T>(
  service: Service,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await send(service, path, options, tokenStore.access());
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("Could not reach the server.", 0);
  }

  // One refresh attempt, then give up and end the session.
  if (response.status === 401 && !options.anonymous) {
    const token = await refreshOnce();

    if (!token) {
      tokenStore.clear();
      onSessionExpired();
      throw new ApiError("Your session has expired. Please sign in again.", 401);
    }

    response = await send(service, path, options, token);

    if (response.status === 401) {
      tokenStore.clear();
      onSessionExpired();
      throw new ApiError("Your session has expired. Please sign in again.", 401);
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw parseError(payload, response.status, response.statusText);
  }

  return payload as T;
}

/**
 * Turn a filter object into a query string, dropping empty values.
 *
 * Takes `object` rather than `Record<string, unknown>` so the typed filter
 * interfaces can be passed straight in without an index signature.
 */
export function query(params: object): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
