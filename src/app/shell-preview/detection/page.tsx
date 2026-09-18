import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LikelihoodMeter } from "@/components/detection/likelihood-meter";
import { SegmentView } from "@/components/detection/segment-view";
import { SignalList } from "@/components/detection/signal-list";
import { DetectionDisclaimer } from "@/components/detection/detection-disclaimer";
import { ScanForm } from "@/components/detection/scan-form";
import { analyzeSignals, splitParagraphs } from "@/lib/detection/signals";
import { CONFIDENCE_COPY } from "@/lib/detection/scoring";
import type { ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Detection preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the detection result view.
 *
 * The real result page needs a session, a scan row and a paid analysis. This
 * renders the same components against fixture data so the layout, the severity
 * ramp and the paragraph highlighting can be checked in a browser — including
 * in dark mode, where the meter uses different steps of the same ramps.
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

const CONTENT = `The relationship between sleep and memory consolidation has been studied for decades, but the mechanism remains contested. I spent three months replicating Walker's 2007 protocol and got nothing like his numbers.

Moreover, the framework provides a comprehensive approach to understanding these processes. Furthermore, it offers a robust methodology for analysing the underlying mechanisms. Additionally, the framework delivers a nuanced perspective on the intricate landscape of consolidation research.

What actually happened was stranger. Participants who slept badly recalled more, not less — which either means the instrument was broken, or that everyone has been measuring the wrong thing. I still don't know which.`;

const SEGMENT_SCORES = [12, 88, 19];

export default function DetectionPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const signals = analyzeSignals(CONTENT);
  const paragraphs = splitParagraphs(CONTENT);

  const segments = paragraphs.map((paragraph, index) => ({
    id: `segment-${index}`,
    position: index,
    start_offset: paragraph.start,
    end_offset: paragraph.end,
    estimated_ai_likelihood: SEGMENT_SCORES[index] ?? 40,
    rationale:
      index === 1
        ? "Three consecutive sentences open with a formal connective and share the same clause structure."
        : "Concrete detail, an admission of uncertainty, and markedly uneven sentence lengths.",
  }));

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Sleep and memory — draft 2"
          description="Fixture data. Word document · 132 words"
          breadcrumbs={[
            { label: "AI Detector", href: "/tools/ai-detector" },
            { label: "Result" },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle as="h2">Check a document</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Fixture props: exercises the client-side gating (word count,
                minimum length, affordability) without a session. */}
            <ScanForm
              creditCost={2}
              maxWords={1500}
              maxFileSizeMb={5}
              balance={30}
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
              <LikelihoodMeter likelihood={41} />
              <p className="mt-5 border-t border-line pt-5 text-sm leading-relaxed text-foreground-muted">
                The opening and closing paragraphs show the uneven rhythm and
                concrete detail typical of a human draft. The middle paragraph is
                markedly more uniform, with repeated clause structures.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle as="h2">How much to trust this</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge tone="neutral">{CONFIDENCE_COPY.low.label}</Badge>
              <p className="text-sm leading-relaxed text-foreground-muted">
                {CONFIDENCE_COPY.low.explanation}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Writing patterns measured</CardTitle>
          </CardHeader>
          <CardContent>
            <SignalList signals={signals.signals} />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Paragraph by paragraph</h2>
          <SegmentView content={CONTENT} segments={segments} />
        </section>

        <DetectionDisclaimer />
      </div>
    </AppShell>
  );
}
