import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, ListChecks } from "lucide-react";

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
import { RubricForm } from "@/components/grading/rubric-form";
import { GradeForm } from "@/components/grading/grade-form";
import { GradeDisclaimer } from "@/components/grading/grade-disclaimer";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listGrades, listRubrics } from "@/lib/grading/queries";
import { isAiConfigured } from "@/lib/env/server";
import { GRADING_FEATURE_KEY, RUBRIC_FEATURE_KEY } from "@/lib/grading/service";
import { routes } from "@/lib/config/routes";
import { formatRelativeTime } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "AI Grader",
  robots: { index: false, follow: false },
};

async function GradeHistory() {
  const grades = await listGrades(8);

  if (grades.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No estimates yet"
        description="Assessed work appears here, with the full breakdown."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {grades.map((grade) => {
        const max = Number(grade.max_points);
        const awarded = Number(grade.estimated_points);

        return (
          <li key={grade.id}>
            <Link
              href={`${routes.grader}/${grade.id}`}
              className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {grade.title}
                </span>
                <span className="block truncate text-xs text-foreground-muted">
                  {grade.rubric_title ?? "Rubric deleted"} ·{" "}
                  {formatRelativeTime(grade.created_at)}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{awarded}</span>
                <span className="text-foreground-subtle"> / {max}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function RubricList() {
  const rubrics = await listRubrics();

  if (rubrics.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No rubrics yet"
        description="Add one and you can grade any number of submissions against it."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rubrics.map((rubric) => (
        <li key={rubric.id}>
          <Link
            href={`${routes.grader}/rubrics/${rubric.id}`}
            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {rubric.title}
              </span>
              <span className="block text-xs text-foreground-muted">
                {rubric.criteria_count} criteria · {Number(rubric.total_points)} points
              </span>
            </span>
            <Badge tone="neutral">Reusable</Badge>
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
        <div key={index} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
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

export default async function GraderPage() {
  const user = await requireUser(routes.grader);
  const [entitlements, rubrics] = await Promise.all([
    getEntitlementsSafe(user.id),
    listRubrics(),
  ]);

  const rubricFeature = entitlements.features[RUBRIC_FEATURE_KEY];
  const gradeFeature = entitlements.features[GRADING_FEATURE_KEY];
  const enabled = Boolean(rubricFeature?.enabled && gradeFeature?.enabled);
  const available = enabled && isAiConfigured;

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Grader"
        description="An estimated grade against your own rubric, broken down criterion by criterion, so you can find the gaps before you submit."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "AI Grader" },
        ]}
      />

      {!isAiConfigured ? (
        <Alert tone="warning" title="Grading isn't available">
          The AI provider isn&apos;t configured on this deployment. No credits
          will be charged.
        </Alert>
      ) : !enabled ? (
        <Alert tone="info" title="Not included in your plan">
          The AI Grader isn&apos;t part of your current plan. Upgrade to unlock
          it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Grade a submission</CardTitle>
              <CardDescription>
                Assessed against one of your rubrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {available ? (
                <GradeForm
                  rubrics={rubrics}
                  creditCost={gradeFeature!.creditCost}
                  maxWords={gradeFeature!.maxWords}
                  maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                  balance={entitlements.credits.balance}
                />
              ) : (
                <p className="text-sm text-foreground-muted">
                  Grading is unavailable right now.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Add a rubric</CardTitle>
              <CardDescription>
                Read once, then grade as many submissions against it as you like.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {available ? (
                <RubricForm
                  creditCost={rubricFeature!.creditCost}
                  balance={entitlements.credits.balance}
                  maxFileSizeMb={entitlements.plan?.maxFileSizeMb ?? 5}
                />
              ) : (
                <p className="text-sm text-foreground-muted">
                  Rubric reading is unavailable right now.
                </p>
              )}
            </CardContent>
          </Card>

          <GradeDisclaimer />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Your rubrics</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<ListSkeleton />}>
                <RubricList />
              </Suspense>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Recent estimates</CardTitle>
              <CardDescription>
                {gradeFeature?.monthlyLimit
                  ? `${gradeFeature.usedThisPeriod} of ${gradeFeature.monthlyLimit} used this month.`
                  : "Your grading history."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<ListSkeleton />}>
                <GradeHistory />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
