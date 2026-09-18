"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/notifications/service";

/**
 * Notification bell and panel.
 *
 * Receives its data from the server so the unread count is correct on first
 * paint rather than appearing a moment later. Opening the panel does not mark
 * anything read — that is an explicit action, because silently clearing a
 * notification the user has not actually looked at loses information they
 * wanted.
 */
export function NotificationMenu({
  items,
  unreadCount,
}: {
  items: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function markOne(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  const label =
    unreadCount > 0
      ? `Notifications (${unreadCount} unread)`
      : "Notifications";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={cn(
          "relative rounded-lg p-2 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground",
          open && "bg-surface-muted text-foreground",
        )}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className={cn(
            "absolute right-0 z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] origin-top-right",
            "overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised",
            "animate-rise",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAll}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline disabled:opacity-60"
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="mt-1 text-xs text-foreground-muted">
                Account and usage updates will appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto divide-y divide-line">
              {items.map((item) => {
                const isUnread = item.read_at === null;

                const content = (
                  <>
                    <span className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          isUnread ? "bg-brand-500" : "bg-transparent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm",
                            isUnread ? "font-medium text-foreground" : "text-foreground-muted",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.body ? (
                          <span className="mt-0.5 block text-xs text-foreground-muted">
                            {item.body}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-xs text-foreground-subtle">
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.action_url ? (
                      <Link
                        href={item.action_url}
                        role="menuitem"
                        onClick={() => {
                          setOpen(false);
                          if (isUnread) markOne(item.id);
                        }}
                        className="block px-4 py-3 transition-colors hover:bg-surface-muted"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => isUnread && markOne(item.id)}
                        disabled={!isUnread}
                        className="block w-full px-4 py-3 text-left transition-colors hover:bg-surface-muted disabled:hover:bg-transparent"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
