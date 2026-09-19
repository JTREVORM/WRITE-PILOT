import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";

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
import { AnalysisForm } from "@/components/coach/analysis-form";
import { CoachDisclaimer } from "@/components/coach/coach-disclaimer";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listAnalyses } from "@/lib/coach/queries";
import { listAssignments } from "@/lib/assignments/queries";
import { loadSelectedDocument } from "@/lib/documents/selection";
import { isAiConfigured } from "@/lib/env/server";
import { ANALYSIS_FEATURE_KEY } from "@/lib/coach/service";
import { routes } from "@/lib/config/routes";
import { formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Writing Coach",
  robots: { index: false, follow: false },
};

async function AnalysisHistory() {
  const analyses = await listAnalyses(8);

  if (analyses.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No reviews yet"
        description="A review becomes a list you work through, and it stays here until you finish it."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {analyses.map((analysis) => (
        <li key={analysis.id}>
          <Link
            href={`${routes.coach}/${analysis.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {analysis.title}
              </span>
              <span className="block truncate text-xs text-foreground-muted">
                {formatRelativeTime(analysis.created_at)}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-foreground-muted">
              {analysis.open_actions} / {analysis.total_actions} to do
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
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(routes.coach);
  const [entitlements, assignments, selectedDocument] = await Promise.all([
    getEntitlementsSafe(user.id),
    listAssignments(),
    loadSelectedDocument(searchParams),
  ]);

  const feature = entitlements.features[ANALYSIS_FEATURE_KEY];
  const enabled = Boolean(feature?.enabled);
  const available = enabled && isAiConfigured;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Writing Coach"
        description="A full review of a draft that comes back as a list, ordered by what is worth your time first."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Writing Coach" },
        ]}
      />

      {!isAiConfigured ? (
        <Alert tone="warning" title="Reviews aren't available">
          The AI provider isn&apos;t configured on this deployment. No credits
          will be charged.
        </Alert>
      ) : !enabled ? (
        <Alert tone="info" title="Not included in your plan">
          A full review is part of the Pro and Educator plans. Upgrade to unlock
          it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Review a draft</CardTitle>
              <CardDescription>
                What to change, in the order worth doing it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {available ? (
                <AnalysisForm
                  document={selectedDocument}
                  creditCost={feature!.creditCost}
                  maxWords={feature!.maxWords}
                  maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                  balance={entitlements.credits.balance}
                  assignments={assignments}
                />
              ) : (
                <p className="text-sm text-foreground-muted">
                  Reviews are unavailable right now.
                </p>
              )}
            </CardContent>
          </Card>

          <CoachDisclaimer />
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Your reviews</CardTitle>
              <CardDescription>
                {feature?.monthlyLimit
                  ? `${feature.usedThisPeriod} of ${feature.monthlyLimit} used this month.`
                  : "Still open at the top."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<ListSkeleton />}>
                <AnalysisHistory />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
