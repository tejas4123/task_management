/** A failed API call. `status` is 0 when the request never reached a server. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isConflict() {
    return this.status === 409;
  }
}

/**
 * Every backend error is `{"detail": ...}`, where detail is either a string or
 * a map of field -> messages. Normalise both into one readable message plus,
 * where available, the per-field errors so a form can show them inline.
 */
export function parseError(
  payload: unknown,
  status: number,
  fallback = "Something went wrong.",
): ApiError {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;

    if (typeof detail === "string") {
      return new ApiError(detail, status);
    }

    if (detail && typeof detail === "object") {
      const fieldErrors: Record<string, string[]> = {};
      for (const [field, messages] of Object.entries(detail)) {
        fieldErrors[field] = Array.isArray(messages)
          ? messages.map(String)
          : [String(messages)];
      }
      const summary = Object.entries(fieldErrors)
        .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
        .join(" · ");
      return new ApiError(summary || fallback, status, fieldErrors);
    }
  }

  return new ApiError(fallback, status);
}
