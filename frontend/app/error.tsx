"use client";

import { BaseButton } from "@/components/shared/BaseButton";

// Route error boundary: a visible error state with a retry. It shows when Flask is down while
// a protected page loads. The session is not touched, so Try again can succeed (AUTH-AC11.3).
//
// Next.js 16.4 `retry()` re-fetches and re-renders the segment. `reset()` only clears the error
// and re-renders the children without re-fetching, so it cannot recover from a failed server
// load. A real-browser check found that bug (evidence/authentication-T03-T04.md).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-start gap-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="break-words">We could not load this page. Your session is unchanged. Try again.</p>
      <BaseButton onClick={() => retry()}>Try again</BaseButton>
    </main>
  );
}
