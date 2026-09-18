import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  Coins,
  CreditCard,
  Sparkles,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { requireUser, getCurrentProfile } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/entitlements/service";
import { getRecentActivity } from "@/lib/usage/service";
import { routes } from "@/lib/config/routes";
import {
  formatDate,
  formatNumber,
  formatRelativeTime,
} from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

function greeting(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  const hour = new Date().getUTCHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return first ? `${part}, ${first}` : part;
}

export default async function DashboardPage() {
  const user = await requireUser(routes.dashboard);
  const [profile, entitlements, activity] = await Promise.all([
    getCurrentProfile(),
    getEntitlements(user.id),
    getRecentActivity(user.id, 6),
  ]);

  const { credits, plan, subscription } = entitlements;
  const allowance = credits.monthlyAllowance || plan?.monthlyCredits || 0;
  const usedThisPeriod = Math.max(0, allowance - credits.allowanceBalance);

  const runsThisPeriod = Object.values(entitlements.features).reduce(
    (total, feature) => total + feature.usedThisPeriod,
    0,
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting(profile?.full_name ?? null)}
        </h1>
        <p className="text-sm text-foreground-muted">
          Here&apos;s where your workspace stands today.
        </p>
      </header>

      {!plan ? (
        <Alert tone="warning" title="No active plan">
          Your account doesn&apos;t have a plan assigned yet, so the tools are
          unavailable. This usually resolves itself within a minute — refresh the
          page, and contact support if it persists.
        </Alert>
      ) : null}

      <section aria-label="Account summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Credits remaining"
          value={formatNumber(credits.balance)}
          icon={Coins}
          progress={allowance > 0 ? { value: usedThisPeriod, max: allowance } : undefined}
          hint={
            allowance > 0
              ? `${formatNumber(usedThisPeriod)} of ${formatNumber(allowance)} monthly credits used`
              : "No monthly allowance on this plan"
          }
        />

        <StatCard
          label="Current plan"
          value={plan?.name ?? "None"}
          icon={CreditCard}
          hint={
            subscription?.cancelAtPeriodEnd
              ? `Ends ${formatDate(subscription.currentPeriodEnd)}`
              : subscription?.currentPeriodEnd
                ? `Renews ${formatDate(subscription.currentPeriodEnd)}`
                : undefined
          }
        />

        <StatCard
          label="Runs this month"
          value={formatNumber(runsThisPeriod)}
          icon={Activity}
          hint="Across every tool"
        />

        <StatCard
          label="Credits reset"
          value={
            credits.periodEnd
              ? formatRelativeTime(credits.periodEnd).replace(/^in /, "")
              : "—"
          }
          icon={CalendarClock}
          hint={credits.periodEnd ? formatDate(credits.periodEnd) : "No period set"}
        />
      </section>

      <QuickActions entitlements={entitlements} />

      <section className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle as="h2">Recent activity</CardTitle>
            <Link
              href={routes.usage}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="Nothing here yet"
                description="Once you run your first check, it'll show up here with what it cost and how long it took."
              />
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((entry) => {
                  const feature = entitlements.features[entry.feature_key];
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {feature?.name ?? entry.feature_key}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {formatRelativeTime(entry.created_at)}
                          {entry.words_processed > 0
                            ? ` · ${formatNumber(entry.words_processed)} words`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {entry.status !== "success" ? (
                          <Badge tone={entry.status === "failure" ? "danger" : "warning"}>
                            {entry.status === "failure" ? "Failed" : "Blocked"}
                          </Badge>
                        ) : null}
                        <span className="text-xs tabular-nums text-foreground-muted">
                          {entry.credits_charged > 0
                            ? `−${entry.credits_charged}`
                            : "—"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Your plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Plan</span>
              <span className="font-medium">{plan?.name ?? "None"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Monthly credits</span>
              <span className="font-medium tabular-nums">
                {formatNumber(plan?.monthlyCredits ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Words per run</span>
              <span className="font-medium tabular-nums">
                {plan?.maxWordsPerRequest
                  ? formatNumber(plan.maxWordsPerRequest)
                  : "Unlimited"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Documents</span>
              <span className="font-medium tabular-nums">
                {plan?.maxDocuments === null || plan?.maxDocuments === undefined
                  ? "Unlimited"
                  : formatNumber(plan.maxDocuments)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Upload size</span>
              <span className="font-medium tabular-nums">
                {plan ? `${plan.maxFileSizeMb} MB` : "—"}
              </span>
            </div>

            <Link
              href={routes.usage}
              className="mt-2 block text-sm font-medium text-brand-600 hover:underline"
            >
              See usage and credit history
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
