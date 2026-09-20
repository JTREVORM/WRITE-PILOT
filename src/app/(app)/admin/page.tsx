import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatTiles, type Stat } from "@/components/admin/stat-tiles";
import { UsageChart } from "@/components/admin/usage-chart";
import { FeatureUsage } from "@/components/admin/feature-usage";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminOverview, getUsageSeries } from "@/lib/admin/queries";
import { routes } from "@/lib/config/routes";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AdminPage() {
  await requireAdmin();

  const [overview, series] = await Promise.all([
    getAdminOverview(),
    getUsageSeries(30),
  ]);

  if (!overview) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Admin"
          breadcrumbs={[
            { label: "Dashboard", href: routes.dashboard },
            { label: "Admin" },
          ]}
        />
        <Alert tone="danger" title="Couldn't load the overview">
          The metrics query failed. The server log has the reason.
        </Alert>
      </div>
    );
  }

  const paidSubscriptions = overview.subscriptions
    .filter((entry) => entry.monthlyCents > 0)
    .reduce((total, entry) => total + entry.count, 0);

  const stats: Stat[] = [
    {
      label: "Accounts",
      value: formatNumber(overview.users.total),
      note: `${formatNumber(overview.users.new7d)} in the last 7 days`,
    },
    {
      label: "Paying subscriptions",
      value: formatNumber(paidSubscriptions),
      note: `${formatMoney(overview.revenue.cents30d)} in the last 30 days`,
    },
    {
      label: "Credits consumed",
      value: formatNumber(overview.credits.consumed30d),
      note: `${formatNumber(overview.credits.refunded30d)} refunded, 30 days`,
    },
    {
      label: "Failures",
      value: formatNumber(overview.health.failures24h),
      note: "AI runs that failed, last 24 hours",
      tone: overview.health.failures24h > 0 ? "warning" : "neutral",
    },
  ];

  const webhookTrouble =
    overview.health.webhookFailures > 0 ||
    overview.health.webhooksUnprocessed > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin"
        description={`Platform health and account administration. Figures as of ${formatRelativeTime(overview.generatedAt)}.`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Admin" },
        ]}
        actions={
          <Link
            href={`${routes.admin}/users`}
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Accounts
          </Link>
        }
      />

      {webhookTrouble ? (
        <Alert tone="warning" title="Payment webhooks need attention">
          {overview.health.webhookFailures > 0
            ? `${formatNumber(overview.health.webhookFailures)} deliveries failed to process. `
            : ""}
          {overview.health.webhooksUnprocessed > 0
            ? `${formatNumber(overview.health.webhooksUnprocessed)} have been sitting unhandled for over fifteen minutes. `
            : ""}
          Each is recorded against its provider event id, so any of them can be
          replayed once the cause is fixed.
        </Alert>
      ) : null}

      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle as="h2">Activity</CardTitle>
            <CardDescription>
              Every AI run, successful or not, over the last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageChart points={series} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">By tool</CardTitle>
            <CardDescription>Runs in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureUsage usage={overview.usage30d} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Plans</CardTitle>
            <CardDescription>Live subscriptions by plan.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {overview.subscriptions.map((entry) => (
                <li
                  key={entry.planKey}
                  className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
                >
                  <span className="text-sm">{entry.planName}</span>
                  <span className="text-sm tabular-nums">
                    {formatNumber(entry.count)}
                    {entry.monthlyCents > 0 ? (
                      <span className="text-foreground-subtle">
                        {" "}
                        · {formatMoney(entry.count * entry.monthlyCents)}/mo
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Credits outstanding</CardTitle>
            <CardDescription>
              What users are currently holding, allowance and purchased
              together.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {formatNumber(overview.credits.outstanding)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
              This is a liability, not revenue: it is work already paid for and
              not yet run.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-foreground-subtle">
        Administration does not include reading customers&apos; writing. These
        figures are counts; the documents, drafts and results behind them are
        readable only by the accounts that own them, by policy in the database
        rather than by convention here.
      </p>
    </div>
  );
}
