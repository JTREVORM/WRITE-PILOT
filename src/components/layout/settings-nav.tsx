"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/utils/cn";

/**
 * Sub-navigation for the settings area.
 *
 * Uses the selected layout segment rather than the full pathname so the active
 * tab is derived from the route tree itself — `null` is the index page, which
 * is exactly what the hook returns there.
 */
const TABS: Array<{ segment: string | null; label: string; href: string }> = [
  { segment: null, label: "Profile", href: "/settings" },
  { segment: "security", label: "Account & security", href: "/settings/security" },
];

export function SettingsNav() {
  const segment = useSelectedLayoutSegment();

  return (
    <nav aria-label="Settings sections" className="border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = segment === tab.segment;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  isActive
                    ? "border-brand-600 font-medium text-foreground"
                    : "border-transparent text-foreground-muted hover:border-line-strong hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
