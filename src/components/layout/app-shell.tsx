import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { CreditMeter, CreditMeterFallback } from "./credit-meter";
import { ThemeToggle } from "./theme-toggle";
import {
  NotificationBell,
  NotificationBellFallback,
} from "./notification-bell";
import { visibleSections } from "@/lib/config/navigation";
import type { Theme } from "@/lib/theme/constants";
import type { AppRole, ProfileRow } from "@/types/database";

/**
 * The signed-in application frame.
 *
 * A fixed sidebar from `lg` up, a drawer below it; the top bar is sticky at
 * every size so the account menu and notifications stay reachable on a phone.
 *
 * The frame itself needs only the profile and the user's roles, both of which
 * are cheap. Everything slower — credits, notifications — sits behind its own
 * Suspense boundary and streams in, so navigation is usable immediately instead
 * of waiting on the entitlement read.
 */
export function AppShell({
  profile,
  roles,
  theme,
  children,
}: {
  profile: ProfileRow;
  roles: AppRole[];
  theme: Theme;
  children: React.ReactNode;
}) {
  const sections = visibleSections(roles);

  const themeRow = (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-xs text-foreground-subtle">Theme</span>
      <ThemeToggle value={theme} />
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* First tabbable element on the page: lets a keyboard user jump past the
          navigation instead of tabbing through it on every route. */}
      <a
        href="#main-content"
        className="sr-only z-100 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <Logo href="/dashboard" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <SidebarNav sections={sections} />
        </div>

        <div className="shrink-0 space-y-3 border-t border-line p-3">
          <Suspense fallback={<CreditMeterFallback />}>
            <CreditMeter userId={profile.id} />
          </Suspense>
          {themeRow}
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:gap-2 sm:px-6">
          <MobileNav sections={sections}>
            <div className="space-y-3">
              <Suspense fallback={<CreditMeterFallback />}>
                <CreditMeter userId={profile.id} />
              </Suspense>
              {themeRow}
            </div>
          </MobileNav>

          <div className="lg:hidden">
            <Logo href="/dashboard" showWordmark={false} />
          </div>

          <div className="flex-1" />

          {/* Its own boundary: a slow notifications query delays the bell, not
              the whole shell. */}
          <Suspense fallback={<NotificationBellFallback />}>
            <NotificationBell />
          </Suspense>

          <UserMenu
            name={profile.full_name}
            email={profile.email}
            avatarUrl={profile.avatar_url}
          />
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
