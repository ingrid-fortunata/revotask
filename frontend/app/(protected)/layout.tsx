import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthContext";
import { SessionRevalidator } from "@/components/auth/SessionRevalidator";
import { AppHeader } from "@/components/shared/AppHeader";
import { getCurrentUser } from "@/lib/server/session";

// Renders the shell for signed-in users. This layout is not the authorization boundary (DD6):
// each page under (protected) calls getCurrentUser() itself. loading.tsx sits below this layout
// on purpose: the layout awaits getCurrentUser() before anything streams, so a missing or
// stale session still gets a real 307 from here, and the skeleton only covers page data.
export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <AuthProvider user={user}>
      <AppHeader />
      <SessionRevalidator />
      <div className="lg:pl-64">{children}</div>
    </AuthProvider>
  );
}
