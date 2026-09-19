import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageSummary } from "@/components/citations/coverage-summary";
import { FindingsList } from "@/components/citations/findings-list";
import { ReferenceList } from "@/components/citations/reference-list";
import { CitationLimits } from "@/components/citations/citation-limits";
import { parseDocument } from "@/lib/citations/parse";
import { matchCitations } from "@/lib/citations/match";
import { getCitationStyle } from "@/lib/citations/styles";
import type {
  CitationEntryRow,
  CitationFindingRow,
  ProfileRow,
} from "@/types/database";

export const metadata: Metadata = {
  title: "Citations preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the citation result screen.
 *
 * The findings are produced by the real parser and the real matcher over a
 * fixture that deliberately contains one of each problem: a source cited and
 * never listed, an entry listed and never cited, and a year that disagrees. Only
 * the two "Assessed" rows are hand-written, standing in for the model's half —
 * which is exactly the half this preview cannot run.
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

const DOCUMENT = [
  "Memory consolidates during sleep (Walker et al., 2007), and the effect",
  "survives a cognitive load manipulation. Okonkwo and Silva (2021) replicated",
  "it across two samples. A later study disagreed (Tan, 2018), though its",
  "sample was small (n = 24).",
  "",
  "References",
  "",
  "Okonkwo, A., & Silva, M. (2021). Working memory under load. Journal of Cognitive Science, 44(2), 113-129. https://doi.org/10.1000/jcs.2021.44",
  "",
  "Tan, R. (2019). Attention and Recall in Short Samples. Memory Studies, 12(1), 3-18.",
  "",
  "Ferreira, L. (2020). Sleep architecture across the lifespan. Neuroscience Reviews, 8(4), 220-241.",
].join("\n");

/** Stands in for the model's half, which needs an API key this preview has not got. */
const ASSESSED: Array<Pick<CitationFindingRow, "severity" | "target_text" | "message" | "suggestion">> = [
  {
    severity: "error",
    target_text: "Tan, R. (2019). Attention and Recall in Short Samples. Memory Studies, 12(1), 3-18.",
    message:
      "The article title uses headline capitalisation. APA 7 capitalises only the first word and any proper nouns.",
    suggestion:
      "Tan, R. (2019). Attention and recall in short samples. Memory Studies, 12(1), 3-18.",
  },
  {
    severity: "warning",
    target_text:
      "Ferreira, L. (2020). Sleep architecture across the lifespan. Neuroscience Reviews, 8(4), 220-241.",
    message: "This entry has no DOI. APA 7 asks for one where the source has one.",
    suggestion: "Add the DOI as a full https://doi.org/ link if the article has one.",
  },
];

export default function CitationsPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const style = getCitationStyle("apa7");
  const parsed = parseDocument(DOCUMENT);
  const { findings: local, coverage } = matchCitations(parsed, style);

  const entries: CitationEntryRow[] = parsed.entries.map((entry) => ({
    id: `entry-${entry.position}`,
    check_id: "preview",
    position: entry.position,
    raw_text: entry.raw,
    first_author: entry.authors[0] ?? null,
    year: entry.year,
    has_link: entry.hasLink,
    cited: !local.some(
      (finding) =>
        finding.kind === "uncited_reference" && finding.entryPosition === entry.position,
    ),
  }));

  const findings: CitationFindingRow[] = [
    ...local.map((finding, index) => ({
      id: `local-${index}`,
      check_id: "preview",
      entry_id:
        finding.entryPosition === null ? null : `entry-${finding.entryPosition}`,
      position: index,
      origin: "local" as const,
      kind: finding.kind,
      severity: finding.severity,
      target_text: finding.target,
      message: finding.message,
      suggestion: finding.suggestion,
      status: "open" as const,
      resolved_at: null,
    })),
    ...ASSESSED.map((finding, index) => ({
      id: `model-${index}`,
      check_id: "preview",
      entry_id: `entry-${index + 1}`,
      position: local.length + index,
      origin: "model" as const,
      kind: "format",
      severity: finding.severity,
      target_text: finding.target_text,
      message: finding.message,
      suggestion: finding.suggestion,
      status: "open" as const,
      resolved_at: null,
    })),
  ];

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Sleep and memory review"
          description="Fixture data. Checked against APA 7 · findings from the real parser and matcher"
          breadcrumbs={[
            { label: "Citation Checker", href: "/tools/citations" },
            { label: "Check" },
          ]}
        />

        <CoverageSummary
          inTextCount={coverage.inTextCount}
          distinctSources={coverage.distinctSources}
          referenceCount={coverage.referenceCount}
          orphanCount={coverage.orphanCount}
          uncitedCount={coverage.uncitedCount}
          listHeading={parsed.listHeading}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">What to look at</h2>
          <FindingsList checkId="preview" findings={findings} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Your reference list, as read</CardTitle>
          </CardHeader>
          <CardContent>
            <ReferenceList entries={entries} findings={findings} />
          </CardContent>
        </Card>

        <CitationLimits />
      </div>
    </AppShell>
  );
}
