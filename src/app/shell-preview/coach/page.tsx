import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ImprovementList } from "@/components/coach/improvement-list";
import { CoachDisclaimer } from "@/components/coach/coach-disclaimer";
import { carryPriorSignals } from "@/lib/coach/signals";
import { orderActions, priorityScore } from "@/lib/coach/priority";
import type { ImprovementActionRow, ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Coach preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the prioritised improvement list.
 *
 * The measured items are produced by the real signal carrier from fixture
 * check results, and everything is ordered by the real scorer — so a change to
 * the weighting shows up here as a change in the order, which is the only way
 * to see whether the ordering is any good.
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

/** Stands in for the model's half of the review. */
const ADVISED = [
  {
    title: "Answer the strongest objection to your central claim",
    detail:
      "Section three argues that consolidation is load-dependent and never engages the obvious reply: that the effect could be an artefact of the recall task. A reader who has thought of it will assume you have not.",
    location: "Section 3, from “The evidence suggests”",
    category: "argument" as const,
    impact: 5,
    effort: 3,
  },
  {
    title: "Move the scope statement into the opening paragraph",
    detail:
      "It currently arrives on page two. Until then the reader does not know whether this is about sleep, about memory, or about the intervention.",
    location: "Introduction",
    category: "structure" as const,
    impact: 4,
    effort: 1,
  },
  {
    title: "Cut the methods recap in the discussion",
    detail:
      "The first two paragraphs of the discussion restate what the methods section already said. The discussion is where the argument goes.",
    location: "Discussion, first two paragraphs",
    category: "clarity" as const,
    impact: 2,
    effort: 2,
  },
];

export default function CoachPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // The real carrier, over the kind of results the other tools produce.
  const carried = carryPriorSignals({
    citations: { orphans: 2, uncited: 1, style: "APA 7" },
    grammar: { openSuggestions: 12, significant: 3 },
    grade: {
      percentage: 64,
      weakCriteria: [{ name: "Argument and analysis", awarded: 8, max: 20 }],
    },
  });

  const merged = orderActions([
    ...carried.map((action) => ({
      origin: "measured" as const,
      category: action.category,
      title: action.title,
      detail: action.detail,
      location: null as string | null,
      impact: action.impact,
      effort: action.effort,
      measured: true,
    })),
    ...ADVISED.map((action) => ({
      origin: "advised" as const,
      category: action.category,
      title: action.title,
      detail: action.detail,
      location: action.location as string | null,
      impact: action.impact,
      effort: action.effort,
      measured: false,
    })),
  ]);

  const actions: ImprovementActionRow[] = merged.map((action, index) => ({
    id: `action-${index}`,
    analysis_id: "preview",
    position: index,
    origin: action.origin,
    category: action.category,
    title: action.title,
    detail: action.detail,
    location: action.location,
    impact: action.impact,
    effort: action.effort,
    priority_score: priorityScore(action),
    // The last item is already finished, so the preview shows both states and
    // the "show finished" filter has something to reveal.
    status: index === merged.length - 1 ? "done" : "open",
    resolved_at:
      index === merged.length - 1 ? new Date().toISOString() : null,
    coaching:
      index === 1
        ? "A counter-argument is not a concession — it is the fastest way to show you have understood the problem. Take the strongest version of the objection, state it in one sentence in your own words, then answer it. Your draft says “the evidence suggests a load-dependent effect”; a reader thinking about task artefacts stops there. One sentence naming that possibility, and one explaining why your control condition rules it out, turns a claim into an argument."
        : null,
    coached_at: index === 1 ? new Date().toISOString() : null,
  }));

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Memory consolidation essay"
          description="Fixture data. 1,240 words · list ordered by the real scorer"
          breadcrumbs={[
            { label: "Writing Coach", href: "/tools/coach" },
            { label: "Review" },
          ]}
        />

        <Card>
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
            <p className="text-sm leading-relaxed text-foreground-muted">
              A well-organised draft whose argument would carry considerably
              further if it engaged the obvious objection to it. The structural
              changes below are quick; the argumentative one is an evening.
            </p>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">What to do, in order</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Ordered by how much each change improves the work against how long
              it takes — computed here, not chosen by the model.{" "}
              {carried.length} items were carried from checks you had already
              run.
            </p>
          </div>

          <ImprovementList
            analysisId="preview"
            actions={actions}
            coachCreditCost={4}
            coachAvailable
          />
        </section>

        <CoachDisclaimer />
      </div>
    </AppShell>
  );
}
