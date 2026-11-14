import Link from "next/link";
import { BaseBadge } from "@/components/shared/BaseBadge";
import { BaseButton } from "@/components/shared/BaseButton";
import { formatCommentTime } from "@/lib/comments";
import { notificationText } from "@/lib/notifications";
import type { NotificationItem } from "@/lib/types";

export interface NotificationRowProps {
  item: NotificationItem;
  /** True while the mark request for this row runs. */
  marking: boolean;
  /** True while any mark request runs, so only one runs at a time (R4). */
  disabled: boolean;
  /** The retry message after a failed mark of this row. */
  notice?: string;
  onMark: (id: string) => void;
  /** Called when the row's link is followed. It must not stop the navigation. */
  onFollow: (item: NotificationItem) => void;
}

// One notification (Requirements 7.2 to 7.5, 9.3, 9.5). The sentence is a text node, so markup in a
// card title, board name or actor name shows as literal text. The title is a link to the board (there
// is no card deep link). "Unread" is text, not color alone (FE-D6). Props only: the panel owns the
// requests.
export function NotificationRow({ item, marking, disabled, notice, onMark, onFollow }: NotificationRowProps) {
  const unread = item.read_at === null;
  const text = notificationText(item);
  return (
    <li className="flex min-w-0 flex-col gap-1 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <Link
          href={`/boards/${item.board_id}`}
          onClick={() => onFollow(item)}
          className={`flex min-h-11 min-w-0 flex-1 items-center rounded-field hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            unread ? "font-semibold" : "font-normal"
          }`}
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
        </Link>
        {unread ? <BaseBadge variant="primary" className="mt-3">Unread</BaseBadge> : null}
      </div>
      <p className="min-w-0 text-sm text-base-content/70 [overflow-wrap:anywhere]">
        {item.board_name} · <time dateTime={item.created_at}>{formatCommentTime(item.created_at)}</time>
      </p>
      {unread ? (
        <div>
          <BaseButton
            variant="ghost"
            aria-label={`Mark as read: ${text}`}
            loading={marking}
            disabled={disabled}
            onClick={() => onMark(item.id)}
          >
            Mark as read
          </BaseButton>
        </div>
      ) : null}
      {notice ? (
        <p role="alert" className="text-sm text-error [overflow-wrap:anywhere]">
          {notice}
        </p>
      ) : null}
    </li>
  );
}
