import type { ReactNode } from "react";
import { BrandMark } from "@/components/shared/BrandMark";

// Public pages: /login and /register. Nothing here reads the session cookie, so a stale cookie
// can never cause a redirect loop (AUTH-AC10.5). Mobile first: the card sits at the top on a
// phone, so the on-screen keyboard does not hide it, and centers from 640 px (FE-S4). From 1024 px
// an ink panel with the product line sits beside the form (FE-D2).
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-neutral p-12 text-neutral-content lg:flex">
        <BrandMark className="text-white" />
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Shared boards for work that moves.
          </p>
          <p className="text-lg">Plan with your team on boards everyone can open.</p>
        </div>
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-start p-4 sm:items-center sm:p-6">
        <div className="flex w-full flex-col gap-6">
          <BrandMark className="lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
