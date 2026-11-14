import { barPercent, formatWeekRange } from "@/lib/analytics";
import type { BoardAnalytics } from "@/lib/types";

export interface AnalyticsFiguresProps {
  data: BoardAnalytics;
}

// The analytics figures as text (Requirements 6.2, 6.3, 7.3; FE-D3, FE-D5). Every number is
// present as text and a bar is decorative (aria-hidden). Rows are divided lists inside the one
// panel that the parent draws, so no panel is nested. Names render as text nodes only.
export function AnalyticsFigures({ data }: AnalyticsFiguresProps) {
  const maxCount = Math.max(0, ...data.cards_per_column.map((column) => column.count));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-base-content/70">{formatWeekRange(data.week_start, data.week_end)}</p>
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums sm:text-3xl">{data.completed_cards}</span>
          <span className="min-w-0 break-words text-base">Cards completed this week</span>
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="analytics-columns-heading" className="min-w-0">
          <h3 id="analytics-columns-heading" className="text-base font-semibold">
            Cards per column
          </h3>
          {data.cards_per_column.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/70">No columns yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-base-300">
              {data.cards_per_column.map((column) => (
                <li key={column.column_id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words">{column.name}</span>
                    <span className="shrink-0 tabular-nums">{column.count}</span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-base-200">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${barPercent(column.count, maxCount)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="analytics-activity-heading" className="min-w-0">
          <h3 id="analytics-activity-heading" className="text-base font-semibold">
            Activity this week
          </h3>
          {data.member_activity.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/70">No activity this week.</p>
          ) : (
            <ul className="mt-2 divide-y divide-base-300">
              {data.member_activity.map((member) => (
                <li key={member.user_id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 break-words">{member.name}</span>
                  <span className="shrink-0 tabular-nums">{member.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
