"use client";

import { useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { apiPost } from "@/lib/apiClient";
import { hardRedirect } from "@/lib/navigation";

// Sign out revokes the token in Flask through the same-origin handler, then does a full page
// load of /login. If revocation fails, the session stays and the user can retry (P9).
export function LogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const { handleError } = useErrorHandler();

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await apiPost("/api/auth/logout");
      hardRedirect("/login");
    } catch (error) {
      handleError(error);
      setPending(false);
    }
  }

  return (
    <BaseButton variant="ghost" className={className} loading={pending} onClick={handleClick}>
      {pending ? "Signing out…" : "Sign out"}
    </BaseButton>
  );
}
