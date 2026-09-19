import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckForm } from "@/components/citations/check-form";
import { CitationLimits } from "@/components/citations/citation-limits";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listCitationChecks } from "@/lib/citations/queries";
import { getCitationStyle } from "@/lib/citations/styles";
import { isAiConfigured } from "@/lib/env/server";
import { FEATURE_KEY } from "@/lib/citations/service";
import { routes } from "@/lib/config/routes";
import { formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Citation Checker",
  robots: { index: false, follow: false },
};

async function CheckHistory() {
  const checks = await listCitationChecks(8);

  if (checks.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        title="No checks yet"
        description="Checked documents appear here, with every finding kept."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {checks.map((check) => (
        <li key={check.id}>
          <Link
            href={`${routes.citations}/${check.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {check.title}
              </span>
              <span className="block truncate text-xs text-foreground-muted">
                {getCitationStyle(check.style).label} ·{" "}
                {formatRelativeTime(check.created_at)}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
              {check.reference_count} refs
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
        >
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export default async function CitationsPage() {
  const user = await requireUser(routes.citations);
  const entitlements = await getEntitlementsSafe(user.id);

  const feature = entitlements.features[FEATURE_KEY];
  const enabled = Boolean(feature?.enabled);
  const available = enabled && isAiConfigured;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Citation Checker"
        description="Every citation matched against your reference list, and every entry read against the style you were given."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Citation Checker" },
        ]}
      />

      {!isAiConfigured ? (
        <Alert tone="warning" title="Citation checking isn't available">
          The AI provider isn&apos;t configured on this deployment. No credits
          will be charged.
        </Alert>
      ) : !enabled ? (
        <Alert tone="info" title="Not included in your plan">
          The Citation Checker isn&apos;t part of your current plan. Upgrade to
          unlock it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Check a document</CardTitle>
              <CardDescription>
                Paste the whole thing, reference list and all.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {available ? (
                <CheckForm
                  creditCost={feature!.creditCost}
                  maxWords={feature!.maxWords}
                  maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                  balance={entitlements.credits.balance}
                />
              ) : (
                <p className="text-sm text-foreground-muted">
                  Citation checking is unavailable right now.
                </p>
              )}
            </CardContent>
          </Card>

          <CitationLimits />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Recent checks</CardTitle>
              <CardDescription>
                {feature?.monthlyLimit
                  ? `${feature.usedThisPeriod} of ${feature.monthlyLimit} used this month.`
                  : "Your checking history."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<ListSkeleton />}>
                <CheckHistory />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
