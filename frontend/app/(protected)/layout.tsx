import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthContext";
import { SessionRevalidator } from "@/components/auth/SessionRevalidator";
import { AppHeader } from "@/components/shared/AppHeader";
import { getCurrentUser } from "@/lib/server/session";

// Renders the shell for signed-in users. This layout is not the authorization boundary (DD6):
// each page under (protected) calls getCurrentUser() itself. Do not add loading.tsx here:
// the Next.js docs say redirect() in a streaming context emits a meta tag and not an HTTP
// redirect, which would break the 307 this slice checks (not tested here).
export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <AuthProvider user={user}>
      <AppHeader />
      <SessionRevalidator />
      {children}
    </AuthProvider>
  );
}
