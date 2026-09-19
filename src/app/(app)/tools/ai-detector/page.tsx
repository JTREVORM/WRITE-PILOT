import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";

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
import { ScanForm } from "@/components/detection/scan-form";
import { DetectionDisclaimer } from "@/components/detection/detection-disclaimer";
import { LikelihoodChip } from "@/components/detection/likelihood-meter";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listScans } from "@/lib/detection/queries";
import { isAiConfigured } from "@/lib/env/server";
import { FEATURE_KEY } from "@/lib/detection/service";
import { loadSelectedDocument } from "@/lib/documents/selection";
import { routes } from "@/lib/config/routes";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "AI Detector",
  robots: { index: false, follow: false },
};

async function ScanHistory() {
  const scans = await listScans(10);

  if (scans.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        title="No scans yet"
        description="Your checks will be listed here, so you can come back to them."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {scans.map((scan) => (
        <li key={scan.id}>
          <Link
            href={`${routes.aiDetector}/${scan.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {scan.title}
              </span>
              <span className="block text-xs text-foreground-muted">
                {formatRelativeTime(scan.created_at)} ·{" "}
                {formatNumber(scan.word_count)} words
              </span>
            </span>
            <LikelihoodChip likelihood={scan.estimated_ai_likelihood} />
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
        <div key={index} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function AiDetectorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(routes.aiDetector);
  const entitlements = await getEntitlementsSafe(user.id);
  const selectedDocument = await loadSelectedDocument(searchParams);
  const feature = entitlements.features[FEATURE_KEY];

  const available = Boolean(feature?.enabled) && isAiConfigured;

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Detector"
        description="Estimate how likely a piece of writing is to have been generated, paragraph by paragraph."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "AI Detector" },
        ]}
      />

      {!isAiConfigured ? (
        <Alert tone="warning" title="Analysis isn't available">
          The AI provider isn&apos;t configured on this deployment, so scans
          can&apos;t run. No credits will be charged.
        </Alert>
      ) : !feature?.enabled ? (
        <Alert tone="info" title="Not included in your plan">
          The AI Detector isn&apos;t part of your current plan. Upgrade to unlock
          it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Check a document</CardTitle>
              <CardDescription>
                Paste text or upload a PDF, DOCX or TXT file.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {available ? (
                <ScanForm
                  document={selectedDocument}
                  creditCost={feature.creditCost}
                  maxWords={feature.maxWords}
                  maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                  balance={entitlements.credits.balance}
                />
              ) : (
                <p className="text-sm text-foreground-muted">
                  Scanning is unavailable right now.
                </p>
              )}
            </CardContent>
          </Card>

          <DetectionDisclaimer />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Recent scans</CardTitle>
            <CardDescription>
              {feature?.monthlyLimit
                ? `${feature.usedThisPeriod} of ${feature.monthlyLimit} used this month.`
                : "Your scan history."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Suspense fallback={<HistorySkeleton />}>
              <ScanHistory />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
