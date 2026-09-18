import { Suspense } from "react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { AccountSummary } from "@/components/dashboard/account-summary";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { PlanPanel } from "@/components/dashboard/plan-panel";
import { SetupNotice } from "@/components/dashboard/setup-notice";
import {
  ActivitySkeleton,
  PlanPanelSkeleton,
  QuickActionsSkeleton,
  StatGridSkeleton,
} from "@/components/dashboard/section-skeletons";
import { requireProfile } from "@/lib/auth/session";
import { greetingFor } from "@/lib/utils/greeting";
import { routes } from "@/lib/config/routes";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Dashboard.
 *
 * The header and layout render immediately; each data section sits behind its
 * own Suspense boundary and streams in as its query resolves. A slow credit
 * read no longer holds up the activity list, or the page's first paint.
 */
export default async function DashboardPage() {
  // Cheap and request-cached — the layout has already resolved both.
  const { user, profile } = await requireProfile();

  return (
    <div className="space-y-8">
      <PageHeader
        title={greetingFor(profile.full_name, profile.timezone)}
        description="Here's where your workspace stands today."
      />

      <SetupNotice
        profile={profile}
        emailConfirmed={Boolean(user.email_confirmed_at)}
      />

      <Suspense fallback={<StatGridSkeleton />}>
        <AccountSummary userId={user.id} />
      </Suspense>

      <Suspense fallback={<QuickActionsSkeleton />}>
        <QuickActions userId={user.id} />
      </Suspense>

      <section className="grid gap-6 lg:grid-cols-5">
        <Suspense fallback={<ActivitySkeleton />}>
          <RecentActivity userId={user.id} />
        </Suspense>

        <Suspense fallback={<PlanPanelSkeleton />}>
          <PlanPanel userId={user.id} />
        </Suspense>
      </section>

      <noscript>
        <Alert tone="info">
          Some parts of WritePilot need JavaScript. Please enable it, or{" "}
          <a href={routes.home}>return to the site</a>.
        </Alert>
      </noscript>
    </div>
  );
}
