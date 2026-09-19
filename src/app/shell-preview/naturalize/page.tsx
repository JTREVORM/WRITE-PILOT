import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Comparison } from "@/components/naturalize/comparison";
import { IntegrityPanel } from "@/components/naturalize/integrity-panel";
import { splitParagraphs } from "@/lib/text/segment";
import { diffStats, diffWords } from "@/lib/naturalize/diff";
import { checkIntegrity } from "@/lib/naturalize/integrity";
import type { NaturalizeParagraphRow, ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Naturalize preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the Naturalize comparison.
 *
 * Runs the real diff and the real integrity checks over fixture text, so the
 * word-level marks and the findings panel are produced exactly as they are in
 * the live tool. The fixture deliberately drops a citation in the second
 * paragraph, so the integrity panel has something true to report.
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

const ORIGINAL = `In order to demonstrate the effectiveness of the intervention, we conducted a study which involved a total of 240 participants over the course of twelve weeks.

It was found by the researchers that memory consolidation improved by 18% during the period of the study (Walker et al., 2007).

The implications of these findings are significant.`;

const IMPROVED = `To test whether the intervention worked, we studied 240 participants over twelve weeks.

The researchers found that memory consolidation improved by 18% during the study.

These findings matter.`;

export default function NaturalizePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const originals = splitParagraphs(ORIGINAL).map((p) => p.text);
  const improvedParts = splitParagraphs(IMPROVED).map((p) => p.text);

  const paragraphs: NaturalizeParagraphRow[] = originals.map((text, index) => ({
    id: `pair-${index}`,
    run_id: "preview",
    position: index,
    original_text: text,
    improved_text: improvedParts[index] ?? text,
    note:
      index === 0
        ? "Cut padding and split a 32-word sentence."
        : index === 1
          ? "Replaced the passive construction."
          : "Tightened the closing line.",
    changed: (improvedParts[index] ?? text) !== text,
  }));

  const stats = diffStats(diffWords(ORIGINAL, IMPROVED));
  const findings = checkIntegrity(ORIGINAL, IMPROVED, {
    retention: stats.retention,
    mode: "natural",
  });

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Intervention study abstract"
          description={`Fixture data. Natural · ${Math.round(stats.retention * 100)}% of the original wording kept · findings from the real checks`}
          breadcrumbs={[
            { label: "Naturalize", href: "/tools/naturalize" },
            { label: "Rewrite" },
          ]}
        />

        <div className="max-w-3xl">
          <IntegrityPanel findings={findings} />
        </div>

        <Comparison paragraphs={paragraphs} improved={IMPROVED} />
      </div>
    </AppShell>
  );
}
