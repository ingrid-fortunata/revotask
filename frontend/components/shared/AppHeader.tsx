"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useAuth } from "@/hooks/useAuth";

// Mobile first: the row wraps, the user's name truncates, and Sign out keeps a 44 px target
// (FE-S4, FE-S5). The brand links to the dashboard at "/" with a 44 px tappable box.
export function AppHeader() {
  const { user } = useAuth();
  return (
    <header className="navbar flex-wrap gap-2 bg-base-100 px-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-lg font-bold"
        >
          RevoTask
        </Link>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="min-w-0 max-w-[50vw] truncate text-sm"
          title={user.name}
        >
          {user.name}
        </span>
        <LogoutButton />
      </div>
    </header>
  );
}
