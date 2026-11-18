"use client";

import { BaseButton } from "@/components/shared/BaseButton";
import "./globals.css";

// Last-resort boundary for a failure in the root layout, where app/error.tsx cannot help. It
// replaces the root layout, so it renders its own <html> and <body> and imports the stylesheet
// itself. The Figtree font is skipped: the system font is enough for a rare error screen. Like
// error.tsx it calls `retry()`, which re-fetches, and never shows the error text.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-base-200 text-base-content antialiased">
        <main className="mx-auto w-full max-w-md p-4 sm:p-6">
          <div className="surface flex flex-col items-start gap-4 p-6">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="break-words text-base-content/80">RevoTask could not load. Your session is unchanged. Try again.</p>
            <BaseButton onClick={() => retry()}>Try again</BaseButton>
          </div>
        </main>
      </body>
    </html>
  );
}
