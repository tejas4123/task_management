import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "@/api";
import { setSessionExpiredHandler } from "@/api/client";
import { tokenStore } from "@/api/tokens";
import type { User } from "@/api/types";

/* ---------------------------------------------------------------------------
   Who is signed in.

   The token is the source of truth, not this state: on a reload we ask the
   server who the stored token belongs to rather than trusting anything cached
   in the browser. `status` distinguishes "still checking" from "signed out",
   so the app does not flash the login screen at a signed-in user.
--------------------------------------------------------------------------- */

interface AuthApi {
  user: User | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthApi["status"]>("loading");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tokenStore.access()) {
      setStatus("anonymous");
      return;
    }

    let cancelled = false;

    api.auth
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        tokenStore.clear();
        setStatus("anonymous");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("anonymous");
    // Another user's data must not survive in the cache.
    queryClient.clear();
  }, [queryClient]);

  // The HTTP client calls this when a refresh fails, from outside React.
  useEffect(() => {
    setSessionExpiredHandler(logout);
  }, [logout]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { user: signedIn } = await api.auth.login(username, password);
      queryClient.clear();
      setUser(signedIn);
      setStatus("authenticated");
      return signedIn;
    },
    [queryClient],
  );

  const value = useMemo<AuthApi>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const api = useContext(AuthContext);
  if (!api) throw new Error("useAuth must be used inside <AuthProvider>");
  return api;
}

/** The signed-in user, for the many components that only render behind the guard. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser used outside an authenticated route");
  return user;
}
