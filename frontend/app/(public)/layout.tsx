import type { ReactNode } from "react";

// Public pages: /login and /register. Nothing here reads the session cookie, so a stale cookie
// can never cause a redirect loop (AUTH-AC10.5). Mobile first: the card sits at the top on a
// phone, so the on-screen keyboard does not hide it, and centers from 640 px (FE-S4).
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-start p-4 sm:items-center sm:p-6">
      {children}
    </main>
  );
}
