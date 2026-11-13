"use client";

import { createContext, type ReactNode, useMemo } from "react";
import type { PublicUser } from "@/lib/types";

export interface AuthContextValue {
  user: PublicUser;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  user: PublicUser;
  children: ReactNode;
}

// Holds the public user only. The provider copies the three allowed fields, so a token or any
// other property that reaches it from the server is dropped (AUTH-AC11.6). A setUser arrives
// with the profile slice (T12).
export function AuthProvider({ user, children }: AuthProviderProps) {
  const { id, name, email } = user;
  const value = useMemo<AuthContextValue>(() => ({ user: { id, name, email } }), [id, name, email]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
