import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "./sidebar-nav";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { CreditMeter } from "./credit-meter";
import { visibleSections } from "@/lib/config/navigation";
import type { Entitlements } from "@/lib/entitlements/types";
import type { ProfileRow } from "@/types/database";

/**
 * The signed-in application frame.
 *
 * A fixed sidebar from `lg` up, a drawer below it; the top bar is sticky on
 * every size so the account menu stays reachable on a phone. Rendered on the
 * server so navigation, plan and credits arrive with the first paint instead of
 * flashing in.
 */
export function AppShell({
  profile,
  entitlements,
  children,
}: {
  profile: ProfileRow;
  entitlements: Entitlements;
  children: React.ReactNode;
}) {
  const sections = visibleSections(entitlements.roles);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <Logo href="/dashboard" />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <SidebarNav sections={sections} />
        </div>

        <div className="shrink-0 border-t border-line p-3">
          <CreditMeter entitlements={entitlements} />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
          <MobileNav sections={sections}>
            <CreditMeter entitlements={entitlements} />
          </MobileNav>

          <div className="lg:hidden">
            <Logo href="/dashboard" showWordmark={false} />
          </div>

          <div className="flex-1" />

          <UserMenu
            name={profile.full_name}
            email={profile.email}
            avatarUrl={profile.avatar_url}
            planName={entitlements.plan?.name ?? null}
          />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
