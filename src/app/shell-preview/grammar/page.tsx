import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { GrammarWorkspace } from "@/components/grammar/grammar-workspace";
import { ReadabilityPanel } from "@/components/grammar/readability-panel";
import { analyzeReadability } from "@/lib/grammar/readability";
import { locateSuggestions } from "@/lib/grammar/locate";
import type { GrammarSuggestionRow, ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Grammar preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the grammar workspace.
 *
 * Runs the real locating pipeline over fixture text, so the offsets, the inline
 * marks and the derived corrected text are all produced the same way they are
 * in the live tool. Accept/dismiss will not persist here — there is no session —
 * but the rendering, filtering and optimistic behaviour are the real thing.
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

const CONTENT = `I are writing to express my interest in the research assistant position. In order to demonstrate my suitability, I have attached my CV.

My previous work focussed on sleep and memory. The the results were inconclusive, however I learnt a great deal from the process.`;

const RAW = [
  {
    sentence_index: 0,
    original_fragment: "are",
    suggested_fragment: "am",
    category: "grammar",
    severity: "correction",
    explanation: "“I” takes “am”, not “are”.",
  },
  {
    sentence_index: 1,
    original_fragment: "In order to",
    suggested_fragment: "To",
    category: "wordiness",
    severity: "improvement",
    explanation: "“In order to” can almost always be shortened to “to”.",
  },
  {
    sentence_index: 3,
    original_fragment: "The the",
    suggested_fragment: "The",
    category: "repetition",
    severity: "correction",
    explanation: "“The” is repeated.",
  },
  {
    sentence_index: 3,
    original_fragment: "inconclusive, however",
    suggested_fragment: "inconclusive; however,",
    category: "punctuation",
    severity: "improvement",
    explanation: "A comma cannot join two independent clauses.",
  },
];

export default function GrammarPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const readability = analyzeReadability(CONTENT);
  const { located } = locateSuggestions(CONTENT, RAW);

  const suggestions: GrammarSuggestionRow[] = located.map((item, index) => ({
    id: `suggestion-${index}`,
    check_id: "preview",
    position: item.position,
    start_offset: item.startOffset,
    end_offset: item.endOffset,
    category: item.category as GrammarSuggestionRow["category"],
    severity: item.severity as GrammarSuggestionRow["severity"],
    original_text: item.originalText,
    suggested_text: item.suggestedText,
    explanation: item.explanation,
    status: "pending",
    resolved_at: null,
  }));

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Research assistant cover letter"
          description={`Fixture data. ${readability.wordCount} words · ${suggestions.length} suggestions located by the real pipeline`}
          breadcrumbs={[
            { label: "Grammar Checker", href: "/tools/grammar" },
            { label: "Check" },
          ]}
        />

        <GrammarWorkspace
          checkId="preview"
          content={CONTENT}
          suggestions={suggestions}
        />

        <div className="max-w-md">
          <ReadabilityPanel readability={readability} />
        </div>
      </div>
    </AppShell>
  );
}
