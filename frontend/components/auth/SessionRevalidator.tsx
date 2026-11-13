"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// A page restored from the browser's back-forward cache skips the server. Re-run the session
// check then, so private content from before sign out cannot reappear (AUTH-AC11.5).
export function SessionRevalidator() {
  const router = useRouter();
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) router.refresh();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);
  return null;
}
