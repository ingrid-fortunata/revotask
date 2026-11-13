"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/components/auth/AuthContext";

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
