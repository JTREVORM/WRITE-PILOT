import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { NaturalizeForm } from "@/components/naturalize/naturalize-form";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listNaturalizeRuns } from "@/lib/naturalize/queries";
import { getMode } from "@/lib/naturalize/modes";
import { isAiConfigured } from "@/lib/env/server";
import { FEATURE_KEY } from "@/lib/naturalize/service";
import { disclaimers } from "@/lib/config/site";
import { routes } from "@/lib/config/routes";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Naturalize",
  robots: { index: false, follow: false },
};

async function RunHistory() {
  const runs = await listNaturalizeRuns(10);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nothing yet"
        description="Your rewrites stay here, with the original alongside each one."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`${routes.naturalize}/${run.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {run.title}
              </span>
              <span className="block text-xs text-foreground-muted">
                {formatRelativeTime(run.created_at)} ·{" "}
                {formatNumber(run.word_count)} → {formatNumber(run.improved_word_count)} words
              </span>
            </span>
            <Badge tone="neutral">{getMode(run.mode).label}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HistorySkeleton() {
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
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function NaturalizePage() {
  const user = await requireUser(routes.naturalize);
  const entitlements = await getEntitlementsSafe(user.id);
  const feature = entitlements.features[FEATURE_KEY];

  const available = Boolean(feature?.enabled) && isAiConfigured;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Naturalize"
        description="Clearer, better-flowing writing that still says what you meant — and still sounds like you."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Naturalize" },
        ]}
      />

      {!isAiConfigured ? (
        <Alert tone="warning" title="Naturalize isn't available">
          The AI provider isn&apos;t configured on this deployment. No credits
          will be charged.
        </Alert>
      ) : !feature?.enabled ? (
        <Alert tone="info" title="Not included in your plan">
          Naturalize isn&apos;t part of your current plan. Upgrade to unlock it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Improve your writing</CardTitle>
              <CardDescription>
                Pick what you&apos;re writing for, then paste your text or upload
                a document.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {available ? (
                <NaturalizeForm
                  creditCost={feature.creditCost}
                  maxWords={feature.maxWords}
                  maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                  balance={entitlements.credits.balance}
                />
              ) : (
                <p className="text-sm text-foreground-muted">
                  Naturalize is unavailable right now.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-line bg-surface-muted/60 p-4">
            <p className="text-xs leading-relaxed text-foreground-muted">
              {disclaimers.naturalize}
            </p>
          </div>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Recent rewrites</CardTitle>
            <CardDescription>
              {feature?.monthlyLimit
                ? `${feature.usedThisPeriod} of ${feature.monthlyLimit} used this month.`
                : "Your history."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Suspense fallback={<HistorySkeleton />}>
              <RunHistory />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
