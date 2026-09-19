import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradeMeter } from "@/components/grading/grade-meter";
import { GradeDisclaimer } from "@/components/grading/grade-disclaimer";
import { CriterionBreakdown } from "@/components/grading/criterion-breakdown";
import { RubricEditor } from "@/components/grading/rubric-editor";
import { totalFor } from "@/lib/grading/score";
import type {
  GradeCriterionRow,
  ProfileRow,
  RubricCriterionRow,
} from "@/types/database";

export const metadata: Metadata = {
  title: "Grading preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the grader's result screen.
 *
 * The meter, the breakdown and the rubric editor are the three pieces that only
 * appear after a paid run, so they are the three that would otherwise never be
 * seen in a browser before release. The total is computed by the real
 * `totalFor`, not written into the fixture, so a drift between the headline and
 * the criteria below it shows up here.
 *
 * Unreachable in production.
 */
const PROFILE: ProfileRow = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "ada@university.edu",
  full_name: "Ada Lovelace",
  avatar_url: null,
  country: "GB",
  timezone: "Europe/London",
  locale: "en",
  user_type: "researcher",
  marketing_opt_in: false,
  onboarding_completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const CRITERIA: GradeCriterionRow[] = [
  {
    id: "criterion-0",
    grade_id: "preview",
    rubric_criterion_id: null,
    position: 0,
    name: "Introduction and framing",
    awarded_points: 8,
    max_points: 10,
    explanation:
      "The research question is stated in the first paragraph and the scope is clear.",
    strengths: ["States the question before the background."],
    weaknesses: ["The scope sentence arrives two paragraphs late."],
    missing: [],
    improvements: ["Move the scope statement up to the opening paragraph."],
  },
  {
    id: "criterion-1",
    grade_id: "preview",
    rubric_criterion_id: null,
    position: 1,
    name: "Argument and analysis",
    awarded_points: 16,
    max_points: 20,
    explanation:
      "The central argument is sustained, but it is never tested against the strongest objection.",
    strengths: ["Each section advances one claim."],
    weaknesses: ["No counter-position is engaged."],
    missing: ["The rubric asks for an evaluated alternative explanation."],
    improvements: [
      "Add a paragraph stating the strongest objection and answering it.",
    ],
  },
  {
    id: "criterion-2",
    grade_id: "preview",
    rubric_criterion_id: null,
    position: 2,
    name: "Use of evidence",
    awarded_points: 15,
    max_points: 20,
    explanation: "Sources are relevant and recent; two claims carry no citation.",
    strengths: ["Sources are recent and on topic."],
    weaknesses: ["Two quantitative claims are uncited."],
    missing: [],
    improvements: ["Cite the 18% figure and the sample size."],
  },
];

const RUBRIC_CRITERIA: RubricCriterionRow[] = [
  {
    id: "rubric-criterion-0",
    rubric_id: "preview",
    position: 0,
    name: "Introduction and framing",
    description: "States the research question and the scope of the work.",
    max_points: 10,
  },
  {
    id: "rubric-criterion-1",
    rubric_id: "preview",
    position: 1,
    name: "Argument and analysis",
    description: "Sustains a position and evaluates at least one alternative.",
    max_points: 20,
  },
  {
    id: "rubric-criterion-2",
    rubric_id: "preview",
    position: 2,
    name: "Use of evidence",
    description: "Supports claims with cited, relevant sources.",
    max_points: 20,
  },
];

export default function GradingPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const total = totalFor(
    CRITERIA.map((criterion) => ({
      awardedPoints: Number(criterion.awarded_points),
      maxPoints: Number(criterion.max_points),
    })),
  );

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Memory consolidation essay"
          description="Fixture data. CS 1102 Assignment 1 · 1,240 words"
          breadcrumbs={[
            { label: "AI Grader", href: "/tools/grader" },
            { label: "Estimate" },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
              <GradeMeter
                awarded={total.awarded}
                max={total.max}
                percentage={total.percentage}
              />
              <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-foreground-muted">
                A well-organised piece whose argument would carry further if it
                engaged the obvious objection to it.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle as="h2">Do these first</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5">
                {[
                  "Answer the strongest objection to the central claim.",
                  "Cite the two quantitative claims in section three.",
                ].map((item, index) => (
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
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Criterion by criterion</h2>
          <CriterionBreakdown criteria={CRITERIA} />
        </section>

        <GradeDisclaimer />

        <Card>
          <CardHeader>
            <CardTitle as="h2">Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <RubricEditor rubricId="preview" criteria={RUBRIC_CRITERIA} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
