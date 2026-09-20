import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAdminPanel } from "@/components/admin/user-admin-panel";
import { requireAdmin } from "@/lib/auth/guards";
import { getUserDetail } from "@/lib/admin/queries";
import { listPublicPlans } from "@/lib/billing/queries";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;

  const [detail, plans] = await Promise.all([
    getUserDetail(userId),
    listPublicPlans(),
  ]);

  if (!detail) notFound();

  const { profile, credits, subscription, contentCounts } = detail;

  return (
    <div className="space-y-8">
      <PageHeader
        title={profile.fullName ?? profile.email}
        description={`${profile.email} · joined ${formatDate(profile.createdAt)}${
          profile.country ? ` · ${profile.country}` : ""
        }`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Admin", href: routes.admin },
          { label: "Accounts", href: `${routes.admin}/users` },
          { label: "Account" },
        ]}
        actions={
          <span className="flex items-center gap-2">
            {detail.roles.map((role) => (
              <Badge key={role} tone={role === "admin" ? "brand" : "neutral"}>
                {role}
              </Badge>
            ))}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {subscription?.planName ?? "Free"}
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              {subscription
                ? `${subscription.status}${
                    subscription.currentPeriodEnd
                      ? ` · renews ${formatDate(subscription.currentPeriodEnd)}`
                      : ""
                  }`
                : "No subscription"}
            </p>
            {subscription ? (
              <p className="mt-0.5 text-xs text-foreground-subtle">
                via {subscription.provider}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatNumber((credits?.balance ?? 0) + (credits?.purchased ?? 0))}
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              {formatNumber(credits?.balance ?? 0)} allowance,{" "}
              {formatNumber(credits?.purchased ?? 0)} purchased
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Content</CardTitle>
            <CardDescription>Counts only.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1 text-sm">
              {[
                ["Documents", contentCounts.documents],
                ["Assignments", contentCounts.assignments],
                ["Scans", contentCounts.scans],
                ["Grades", contentCounts.grades],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-3">
                  <dt className="text-foreground-muted">{label}</dt>
                  <dd className="tabular-nums">{formatNumber(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle as="h2">Administer</CardTitle>
            <CardDescription>
              Every change here is audited, with the reason you give.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserAdminPanel
              userId={profile.id}
              currentPlanKey={subscription?.planKey ?? null}
              planOptions={plans.map((plan) => ({
                key: plan.key,
                name: plan.name,
              }))}
              roles={detail.roles}
            />
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Usage, 30 days</CardTitle>
            </CardHeader>
            <CardContent className={detail.usage30d.length > 0 ? "p-0" : undefined}>
              {detail.usage30d.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No runs in the last 30 days.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {detail.usage30d.map((entry) => (
                    <li
                      key={entry.featureKey}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6"
                    >
                      <span className="truncate">{entry.featureKey}</span>
                      <span className="shrink-0 tabular-nums text-foreground-muted">
                        {formatNumber(entry.runs)} runs
                        {entry.failures > 0
                          ? ` · ${formatNumber(entry.failures)} failed`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Recent credit movements</CardTitle>
            </CardHeader>
            <CardContent className={detail.recentCredits.length > 0 ? "p-0" : undefined}>
              {detail.recentCredits.length === 0 ? (
                <p className="text-sm text-foreground-muted">Nothing yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {detail.recentCredits.map((entry, index) => (
                    <li
                      key={`${entry.createdAt}-${index}`}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {entry.reason ?? entry.type}
                        </span>
                        <span className="block text-xs text-foreground-muted">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {entry.amount > 0 ? "+" : ""}
                        {formatNumber(entry.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-xs text-foreground-subtle">
        This page shows what this account has and what it has done, never what
        it has written. The documents, drafts and results behind these counts
        are readable only by the account that owns them.
      </p>
    </div>
  );
}
