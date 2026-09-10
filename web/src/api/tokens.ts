import { STORAGE_KEYS } from "./config";
import type { JwtClaims } from "./types";

/** Token storage. Kept behind functions so the storage medium can change. */

export const tokenStore = {
  access: () => safeGet(STORAGE_KEYS.access),
  refresh: () => safeGet(STORAGE_KEYS.refresh),

  set(access: string, refresh?: string) {
    safeSet(STORAGE_KEYS.access, access);
    if (refresh) safeSet(STORAGE_KEYS.refresh, refresh);
  },

  clear() {
    safeRemove(STORAGE_KEYS.access);
    safeRemove(STORAGE_KEYS.refresh);
  },
};

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode - the session simply will not survive a reload */
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Read the claims out of a JWT without verifying it.
 *
 * The signature is the server's business - the UI only needs the role to decide
 * what to render, and the server rejects anything the claims would have allowed
 * but the user is not entitled to.
 */
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );

    const claims = JSON.parse(json) as JwtClaims;
    return typeof claims.user_id === "number" && claims.role ? claims : null;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims, skewSeconds = 30): boolean {
  return claims.exp * 1000 <= Date.now() + skewSeconds * 1000;
}
