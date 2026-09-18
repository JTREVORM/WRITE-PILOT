import { getNotificationSummary } from "@/lib/notifications/service";
import { NotificationMenu } from "./notification-menu";

/**
 * Server half of the notification bell.
 *
 * Kept separate from the interactive menu so the data is fetched on the server
 * and the unread count is right on first paint. Rendered inside a Suspense
 * boundary by the shell, so a slow query delays the bell and nothing else.
 */
export async function NotificationBell() {
  const { items, unreadCount } = await getNotificationSummary();

  return <NotificationMenu items={items} unreadCount={unreadCount} />;
}

/** Fallback while the summary loads: the button's exact footprint. */
export function NotificationBellFallback() {
  return (
    <div
      className="size-9 rounded-lg bg-surface-muted/60"
      aria-hidden="true"
    />
  );
}
