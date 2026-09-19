import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SpellCheck } from "lucide-react";

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
import { GrammarForm } from "@/components/grammar/grammar-form";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listGrammarChecks } from "@/lib/grammar/queries";
import { isAiConfigured } from "@/lib/env/server";
import { FEATURE_KEY } from "@/lib/grammar/service";
import { loadSelectedDocument } from "@/lib/documents/selection";
import { routes } from "@/lib/config/routes";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Grammar Checker",
  robots: { index: false, follow: false },
};

async function CheckHistory() {
  const checks = await listGrammarChecks(10);

  if (checks.length === 0) {
    return (
      <EmptyState
        icon={SpellCheck}
        title="No checks yet"
        description="Your checks stay here, with whatever you accepted or dismissed."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {checks.map((check) => (
        <li key={check.id}>
          <Link
            href={`${routes.grammar}/${check.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {check.title}
              </span>
              <span className="block text-xs text-foreground-muted">
                {formatRelativeTime(check.created_at)} ·{" "}
                {formatNumber(check.word_count)} words
              </span>
            </span>

            {check.pending_count > 0 ? (
              <Badge tone="brand">{check.pending_count} open</Badge>
            ) : check.suggestion_count > 0 ? (
              <Badge tone="success">Resolved</Badge>
            ) : (
              <Badge tone="neutral">Clean</Badge>
            )}
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
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function GrammarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(routes.grammar);
  const entitlements = await getEntitlementsSafe(user.id);
  const selectedDocument = await loadSelectedDocument(searchParams);
  const feature = entitlements.features[FEATURE_KEY];

  const available = Boolean(feature?.enabled) && isAiConfigured;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Grammar Checker"
        description="Specific, minimal edits you accept or dismiss one at a time. Your original is never overwritten."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Grammar Checker" },
        ]}
      />

      {!isAiConfigured ? (
        <Alert tone="warning" title="Checking isn't available">
          The AI provider isn&apos;t configured on this deployment. No credits
          will be charged.
        </Alert>
      ) : !feature?.enabled ? (
        <Alert tone="info" title="Not included in your plan">
          The Grammar Checker isn&apos;t part of your current plan. Upgrade to
          unlock it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle as="h2">Check your writing</CardTitle>
            <CardDescription>
              Paste text or upload a PDF, DOCX or TXT file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {available ? (
              <GrammarForm
                  document={selectedDocument}
                creditCost={feature.creditCost}
                maxWords={feature.maxWords}
                maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                balance={entitlements.credits.balance}
              />
            ) : (
              <p className="text-sm text-foreground-muted">
                Checking is unavailable right now.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Recent checks</CardTitle>
            <CardDescription>
              {feature?.monthlyLimit
                ? `${feature.usedThisPeriod} of ${feature.monthlyLimit} used this month.`
                : "Your check history."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Suspense fallback={<HistorySkeleton />}>
              <CheckHistory />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
