import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface SessionOrg {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
}

interface AuthState {
  user: SessionUser | null;
  org: SessionOrg | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [org, setOrg] = useState<SessionOrg | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setOrg(data.organisation ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || "Login failed");
    }
    const data = await r.json();
    setUser(data.user);
    setOrg(data.organisation ?? null);
    navigate("/");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setOrg(null);
    navigate("/login");
  };

  return (
    <AuthContext.Provider value={{ user, org, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
