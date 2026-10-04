import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken } from "./api";

export type Role = "owner" | "manager" | "staff";
export type User = { id: number; email: string; fullName: string; role: Role };

type AuthValue = {
  user: User | null;
  loading: boolean;
  isManager: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // On first load, if we have a saved token, ask the server who we are
  useEffect(() => {
    if (!getToken()) return;
    api<User>("GET", "/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  // api.ts fires this event when the server rejects our token
  useEffect(() => {
    window.addEventListener("cc:logout", logout);
    return () => window.removeEventListener("cc:logout", logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("POST", "/auth/login", { email, password });
    setToken(r.token);
    setUser(r.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, isManager: user?.role === "owner" || user?.role === "manager" }),
    [user, loading, login, logout]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export function RequireManager({ children }: { children: ReactNode }) {
  const { isManager } = useAuth();
  if (!isManager) return <Navigate to="/app" replace />;
  return children;
}
