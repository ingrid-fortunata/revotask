"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Avatar } from "@/components/shared/Avatar";
import { BrandMark } from "@/components/shared/BrandMark";
import { useAuth } from "@/hooks/useAuth";

// One <header> that changes shape: a sticky top bar below 1024 px and a fixed 16 rem sidebar from
// 1024 px up. The page content sits at lg:pl-64 in the protected layout. Mobile first: the row wraps,
// the user's name truncates, and every control keeps a 44 px target (FE-S4, FE-S5, FE-D2).
export function AppHeader() {
  const { user } = useAuth();
  const pathname = usePathname() ?? "";
  const onBoards = pathname === "/" || pathname.startsWith("/boards");
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 bg-neutral px-4 py-2 text-neutral-content lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-6 lg:px-3 lg:py-5">
      <div className="min-w-0 flex-1 lg:flex-none lg:px-3">
        <Link href="/" className="inline-flex min-h-11 items-center text-white">
          <BrandMark />
        </Link>
      </div>
      <nav aria-label="Main" className="hidden lg:block">
        <Link
          href="/"
          aria-current={onBoards ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-field px-3 text-sm font-medium ${
            onBoards ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <rect x="3.5" y="4" width="4.5" height="16" rx="1.2" />
            <rect x="9.75" y="4" width="4.5" height="10" rx="1.2" />
            <rect x="16" y="4" width="4.5" height="13" rx="1.2" />
          </svg>
          Boards
        </Link>
      </nav>
      <div className="flex min-w-0 items-center gap-2 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-3 lg:border-t lg:border-white/10 lg:px-1 lg:pt-4">
        <div className="flex min-w-0 items-center gap-2 lg:px-2">
          <span className="hidden sm:inline-flex">
            <Avatar name={user.name} tone="dark" />
          </span>
          <span className="min-w-0 max-w-[28vw] truncate text-sm font-medium text-white sm:max-w-[50vw] lg:max-w-none" title={user.name}>
            {user.name}
          </span>
        </div>
        <LogoutButton className="text-neutral-content hover:bg-white/10 hover:text-white lg:justify-start" />
      </div>
    </header>
  );
}
