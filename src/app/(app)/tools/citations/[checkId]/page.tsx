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
import { Alert } from "@/components/ui/alert";
import { CoverageSummary } from "@/components/citations/coverage-summary";
import { FindingsList } from "@/components/citations/findings-list";
import { ReferenceList } from "@/components/citations/reference-list";
import { CitationLimits } from "@/components/citations/citation-limits";
import { DeleteCitationCheckButton } from "@/components/citations/delete-check-button";
import { requireUser } from "@/lib/auth/session";
import { getCitationCheck } from "@/lib/citations/queries";
import { getCitationStyle } from "@/lib/citations/styles";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Citation check",
  robots: { index: false, follow: false },
};

export default async function CitationCheckPage({
  params,
}: {
  params: Promise<{ checkId: string }>;
}) {
  await requireUser(routes.citations);
  const { checkId } = await params;

  const detail = await getCitationCheck(checkId);
  if (!detail) notFound();

  const { check, entries, findings } = detail;
  const style = getCitationStyle(check.style);

  const orphanCount = findings.filter(
    (finding) => finding.kind === "orphan_citation",
  ).length;
  const uncitedCount = findings.filter(
    (finding) => finding.kind === "uncited_reference",
  ).length;

  // The style the document appears to follow is reported, never assumed. A
  // document written in MLA and checked against APA would otherwise come back
  // covered in findings that are all the same finding.
  const detected = check.detected_style?.trim().toLowerCase() ?? "";
  const styleDisagrees =
    detected.length > 0 &&
    !detected.includes(style.key) &&
    !detected.includes(style.label.toLowerCase().split(" ")[0]!) &&
    !["unclear", "mixed", "none"].includes(detected);

  return (
    <div className="space-y-8">
      <PageHeader
        title={check.title}
        description={`Checked against ${style.label} · ${formatNumber(check.word_count)} words · ${formatDate(check.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Citation Checker", href: routes.citations },
          { label: "Check" },
        ]}
        actions={<DeleteCitationCheckButton checkId={check.id} />}
      />

      <CoverageSummary
        inTextCount={check.in_text_count}
        distinctSources={check.distinct_sources}
        referenceCount={check.reference_count}
        orphanCount={orphanCount}
        uncitedCount={uncitedCount}
        listHeading={check.list_heading}
      />

      {styleDisagrees ? (
        <Alert tone="info" title="This may not be the style you meant">
          You asked for {style.label}, but the document reads as{" "}
          {check.detected_style}. If that is the style your department wants,
          run the check again against it — otherwise the formatting findings
          below are all versions of the same one.
        </Alert>
      ) : null}

      {check.summary ? (
        <Card>
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
            <p className="text-sm leading-relaxed text-foreground-muted">
              {check.summary}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">What to look at</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Marked <strong>Checked</strong> where it was counted against your
            reference list, and <strong>Assessed</strong> where it is a reading
            of {style.label}&apos;s rules.
          </p>
        </div>
        <FindingsList checkId={check.id} findings={findings} />
      </section>

      {entries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Your reference list, as read</CardTitle>
            <CardDescription>
              {entries.length} {entries.length === 1 ? "entry" : "entries"} found
              under &ldquo;{check.list_heading}&rdquo;. If an entry is split or
              merged here, the counts above are reading it the same way.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReferenceList entries={entries} findings={findings} />
          </CardContent>
        </Card>
      ) : null}

      <CitationLimits />
    </div>
  );
}
