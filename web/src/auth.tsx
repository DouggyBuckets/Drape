import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, type User } from "./api";

interface AuthState {
  /** undefined while the initial /auth/me check is in flight. */
  user: User | null | undefined;
  login(email: string, password: string): Promise<void>;
  signup(email: string, password: string): Promise<void>;
  tryDemo(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
      else throw err;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setUser(null));
  }, [refresh]);

  const value: AuthState = {
    user,
    async login(email, password) {
      await api("/auth/login", { method: "POST", json: { email, password } });
      await refresh();
    },
    async signup(email, password) {
      await api("/auth/signup", { method: "POST", json: { email, password } });
      await refresh();
    },
    async tryDemo() {
      await api("/auth/demo", { method: "POST", json: {} });
      await refresh();
    },
    async logout() {
      await api("/auth/logout", { method: "POST", json: {} });
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
