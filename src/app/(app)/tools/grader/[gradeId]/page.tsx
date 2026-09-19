import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeMeter } from "@/components/grading/grade-meter";
import { GradeDisclaimer } from "@/components/grading/grade-disclaimer";
import { CriterionBreakdown } from "@/components/grading/criterion-breakdown";
import { DeleteGradeButton } from "@/components/grading/delete-buttons";
import { requireUser } from "@/lib/auth/session";
import { getGrade } from "@/lib/grading/queries";
import { totalFor } from "@/lib/grading/score";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Estimated grade",
  robots: { index: false, follow: false },
};

function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export default async function GradePage({
  params,
}: {
  params: Promise<{ gradeId: string }>;
}) {
  await requireUser(routes.grader);
  const { gradeId } = await params;

  const detail = await getGrade(gradeId);
  if (!detail) notFound();

  const { grade, criteria } = detail;

  // Recomputed from the stored breakdown rather than read off the header, so
  // the headline and the criteria below it can never disagree.
  const total = totalFor(
    criteria.map((criterion) => ({
      awardedPoints: Number(criterion.awarded_points),
      maxPoints: Number(criterion.max_points),
    })),
  );

  const strengths = readList(grade.overall_strengths);
  const improvements = readList(grade.overall_improvements);

  return (
    <div className="space-y-8">
      <PageHeader
        title={grade.title}
        description={`${grade.rubric_title ?? "Rubric deleted"} · ${formatNumber(grade.word_count)} words · ${formatDate(grade.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "AI Grader", href: routes.grader },
          { label: "Estimate" },
        ]}
        actions={<DeleteGradeButton gradeId={grade.id} />}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
            <GradeMeter
              awarded={total.awarded}
              max={total.max}
              percentage={total.percentage}
            />

            {grade.summary ? (
              <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-foreground-muted">
                {grade.summary}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {improvements.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">Do these first</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2.5">
                  {improvements.map((item, index) => (
                    <li key={index} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                        {index + 1}
                      </span>
                      <span className="text-foreground-muted">{item}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {strengths.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">What works</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {strengths.map((item, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success-500"
                        aria-hidden="true"
                      />
                      <span className="text-foreground-muted">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Criterion by criterion</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Where the estimate came from, and what to change for each one.
          </p>
        </div>
        <CriterionBreakdown criteria={criteria} />
      </section>

      <GradeDisclaimer />
    </div>
  );
}
