"use client";

import { createContext, type ReactNode, useCallback, useMemo, useState } from "react";
import type { PublicUser } from "@/lib/types";

export interface AuthContextValue {
  user: PublicUser;
  /** Replace the user after a profile save. Only `id`, `name` and `email` are kept (P6). */
  setUser: (next: PublicUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  user: PublicUser;
  children: ReactNode;
}

// The only place that copies a user into the context: the three allowed fields, so a token or any
// other property that reaches it from the server or from setUser is dropped (AUTH-AC11.6).
function pick({ id, name, email }: PublicUser): PublicUser {
  return { id, name, email };
}

// Holds the public user only. A save updates it at once through setUser. When the server sends
// different values (after router.refresh() or a navigation), the provider follows them: the state
// is adjusted while rendering, which React supports for a prop that changes, so there is no effect
// and no flash of the old name (DD6).
export function AuthProvider({ user, children }: AuthProviderProps) {
  const { id, name, email } = user;
  const [current, setCurrent] = useState<PublicUser>(() => pick(user));
  const [seen, setSeen] = useState<PublicUser>(() => pick(user));
  if (seen.id !== id || seen.name !== name || seen.email !== email) {
    const fromServer = { id, name, email };
    setSeen(fromServer);
    setCurrent(fromServer);
  }
  const setUser = useCallback((next: PublicUser) => setCurrent(pick(next)), []);
  const value = useMemo<AuthContextValue>(() => ({ user: current, setUser }), [current, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
