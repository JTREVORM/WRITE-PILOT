"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/icon";
import type { NavItem } from "@/lib/config/navigation";

/**
 * A single navigation row.
 *
 * Unavailable tools render as a non-interactive row with a "Soon" marker rather
 * than a link to a route that does not exist yet. That keeps the product's
 * shape visible without ever handing the user a dead end.
 */
export function NavLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive =
    item.available &&
    (pathname === item.href || pathname.startsWith(`${item.href}/`));

  const shared = cn(
    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
  );

  if (!item.available) {
    return (
      <span
        className={cn(shared, "cursor-default text-foreground-subtle")}
        title={`${item.label} arrives in a later release`}
      >
        <Icon name={item.icon} className="size-4 shrink-0 opacity-60" />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        shared,
        isActive
          ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/60 dark:text-brand-200"
          : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Icon
        name={item.icon}
        className={cn(
          "size-4 shrink-0",
          isActive ? "text-brand-600 dark:text-brand-300" : "",
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
