import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Comparison } from "@/components/naturalize/comparison";
import { IntegrityPanel } from "@/components/naturalize/integrity-panel";
import { DeleteRunButton } from "@/components/naturalize/delete-run-button";
import { requireUser } from "@/lib/auth/session";
import { getNaturalizeRun } from "@/lib/naturalize/queries";
import { getMode } from "@/lib/naturalize/modes";
import { analyzeReadability } from "@/lib/grammar/readability";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { IntegrityFinding } from "@/lib/naturalize/integrity";
import type { ReadabilitySummary } from "@/lib/grammar/readability";

export const metadata: Metadata = {
  title: "Rewrite",
  robots: { index: false, follow: false },
};

/** Stored jsonb, read defensively and recomputed if absent. */
function readReadability(value: unknown, text: string): ReadabilitySummary {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as ReadabilitySummary).readingEase === "number"
  ) {
    return value as ReadabilitySummary;
  }
  return analyzeReadability(text);
}

function readFindings(value: unknown): IntegrityFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (finding): finding is IntegrityFinding =>
      Boolean(finding) &&
      typeof finding === "object" &&
      typeof (finding as IntegrityFinding).kind === "string" &&
      typeof (finding as IntegrityFinding).message === "string",
  );
}

export default async function NaturalizeRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requireUser(routes.naturalize);
  const { runId } = await params;

  const detail = await getNaturalizeRun(runId);
  if (!detail) notFound();

  const { run, paragraphs } = detail;
  const mode = getMode(run.mode);
  const before = readReadability(run.readability_before, run.content);
  const after = readReadability(run.readability_after, run.improved);
  const findings = readFindings(run.integrity_findings);

  const easeDelta = Math.round((after.readingEase - before.readingEase) * 10) / 10;

  return (
    <div className="space-y-8">
      <PageHeader
        title={run.title}
        description={`${mode.label} · ${formatNumber(run.word_count)} → ${formatNumber(run.improved_word_count)} words · ${formatDate(run.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Naturalize", href: routes.naturalize },
          { label: "Rewrite" },
        ]}
        actions={<DeleteRunButton runId={run.id} />}
      />

      {run.summary ? (
        <p className="max-w-3xl text-sm leading-relaxed text-foreground-muted">
          {run.summary}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <IntegrityPanel findings={findings} />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Readability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Reading ease</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular-nums text-foreground-subtle">
                  {before.readingEase}
                </span>
                <span aria-hidden="true" className="text-foreground-subtle">
                  →
                </span>
                <span className="font-medium tabular-nums">{after.readingEase}</span>
                {easeDelta !== 0 ? (
                  <Badge tone={easeDelta > 0 ? "success" : "neutral"}>
                    {easeDelta > 0 ? "+" : ""}
                    {easeDelta}
                  </Badge>
                ) : null}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Average sentence</span>
              <span className="font-medium tabular-nums">
                {before.meanSentenceLength} → {after.meanSentenceLength} words
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground-muted">Sentences over 30 words</span>
              <span className="font-medium tabular-nums">
                {before.longSentenceCount} → {after.longSentenceCount}
              </span>
            </div>
            <p className="pt-1 text-xs text-foreground-subtle">
              {after.easeLabel}. Higher is easier to read, not better —
              specialist writing scores low by nature.
            </p>
          </CardContent>
        </Card>
      </div>

      <Comparison paragraphs={paragraphs} improved={run.improved} />
    </div>
  );
}
