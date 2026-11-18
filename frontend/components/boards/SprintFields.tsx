import type { Ref } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";

export interface SprintFieldsProps {
  /** Makes the two input IDs unique when two forms exist at once. */
  idPrefix: string;
  start: string;
  end: string;
  startError?: string;
  endError?: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  /** Let a form focus the first date that has an error. */
  startRef?: Ref<HTMLInputElement>;
  endRef?: Ref<HTMLInputElement>;
  /** Present: a "Clear dates" button empties both fields while one has a value. */
  onClear?: () => void;
}

// The optional sprint range of a board (Requirement 8.10, 8.13). Two native date inputs, so no
// calendar library and no custom widget to make accessible (design DS11). One column below 640 px
// and two from `sm` up. The fieldset names the group for assistive technology. "Clear dates" is
// there because some mobile browsers give a date input no way to empty it.
export function SprintFields({
  idPrefix,
  start,
  end,
  startError,
  endError,
  onStartChange,
  onEndChange,
  startRef,
  endRef,
  onClear,
}: SprintFieldsProps) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium">Sprint dates (optional)</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <FormField
            id={`${idPrefix}-sprint-start`}
            name="sprint_start"
            label="Sprint start"
            type="date"
            value={start}
            error={startError}
            inputRef={startRef}
            onChange={onStartChange}
          />
        </div>
        <div className="min-w-0">
          <FormField
            id={`${idPrefix}-sprint-end`}
            name="sprint_end"
            label="Sprint end"
            type="date"
            value={end}
            error={endError}
            inputRef={endRef}
            onChange={onEndChange}
          />
        </div>
      </div>
      <p className="text-sm text-base-content/70">Set both dates or neither. A sprint is at most 90 days.</p>
      {onClear && (start || end) ? (
        <BaseButton variant="ghost" className="w-full border-base-300 sm:w-auto sm:self-start" onClick={onClear}>
          Clear dates
        </BaseButton>
      ) : null}
    </fieldset>
  );
}
