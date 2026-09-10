import type { ApiAdapter } from "./adapter";
import { config } from "./config";
import { httpApi } from "./http";
import { mockApi } from "./mock";

/**
 * The one object the UI talks to.
 *
 * Both adapters satisfy `ApiAdapter`, so which one is in play is decided once,
 * here, from `VITE_USE_MOCK` - no component knows the difference.
 */
export const api: ApiAdapter = config.useMock ? mockApi : httpApi;

export type { ApiAdapter };
export { ApiError } from "./errors";
