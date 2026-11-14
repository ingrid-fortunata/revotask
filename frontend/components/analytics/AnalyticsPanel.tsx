"use client";

import { useState } from "react";
import { AnalyticsFigures } from "@/components/analytics/AnalyticsFigures";
import { BaseButton } from "@/components/shared/BaseButton";
import { BaseModal } from "@/components/shared/BaseModal";
import { useBoardAnalytics } from "@/hooks/useBoardAnalytics";

export interface AnalyticsPanelProps {
  boardId: string;
  /** The Kanban `position_version`. A rise makes an open analytics dialog read again (A8). */
  version: number;
  /** The board is gone or access was lost (a 404). */
  onAccessLost: () => void;
}

// The analytics entry point (Requirement 6; design DD10 to DD12). A button near the board name
// opens a modal dialog with the figures. The dialog content mounts only while open, so the read
// starts on open and aborts on close, and a closed dialog sends no request.
export function AnalyticsPanel({ boardId, version, onAccessLost }: AnalyticsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <BaseButton
        variant="ghost"
        className="border border-base-300"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Analytics
      </BaseButton>
      <BaseModal open={open} labelledBy="analytics-heading" onClose={() => setOpen(false)} wide>
        <AnalyticsBody boardId={boardId} version={version} onAccessLost={onAccessLost} onClose={() => setOpen(false)} />
      </BaseModal>
    </>
  );
}

interface AnalyticsBodyProps extends AnalyticsPanelProps {
  onClose: () => void;
}

// Mounted only while the dialog is open, so the hook reads on open and aborts on close.
function AnalyticsBody({ boardId, version, onAccessLost, onClose }: AnalyticsBodyProps) {
  const { data, status, busy, error, refresh } = useBoardAnalytics({ boardId, version, onAccessLost });

  let announcement = "";
  if (error) announcement = error;
  else if (busy) announcement = "Loading analytics…";
  else if (data) announcement = "Analytics up to date.";

  return (
    <div aria-busy={busy} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analytics-heading" className="text-lg font-semibold">
          Analytics
        </h2>
        <div className="flex flex-wrap gap-2">
          <BaseButton variant="ghost" className="border border-base-300" onClick={() => void refresh()}>
            Refresh
          </BaseButton>
          <BaseButton variant="ghost" className="border border-base-300" onClick={onClose}>
            Close
          </BaseButton>
        </div>
      </div>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 break-words text-error">{error}</p>
          <BaseButton variant="ghost" className="border border-base-300" onClick={() => void refresh()}>
            Retry
          </BaseButton>
        </div>
      ) : null}
      {data ? (
        <AnalyticsFigures data={data} />
      ) : status === "loading" ? (
        <p className="text-sm text-base-content/70">Loading analytics…</p>
      ) : null}
    </div>
  );
}
