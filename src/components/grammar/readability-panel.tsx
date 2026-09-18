import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/lib/utils/format";
import type { ReadabilitySummary } from "@/lib/grammar/readability";

/**
 * Readability figures.
 *
 * Measured locally from published formulas, so these are reproducible in a way
 * the suggestions are not. Reported as properties of the text with the audience
 * described in words — a reading-ease number on its own means nothing to a
 * writer, and chasing it is not the point.
 */
export function ReadabilityPanel({
  readability,
}: {
  readability: ReadabilitySummary;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Readability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">{readability.easeLabel}</span>
            <span className="text-sm tabular-nums text-foreground-muted">
              {readability.readingEase} / 100
            </span>
          </div>
          <Progress
            className="mt-2"
            value={readability.readingEase}
            max={100}
            label="Reading ease"
          />
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            {readability.easeDescription}
          </p>
        </div>

        <dl className="space-y-2 border-t border-line pt-3 text-sm">
          <Row
            label="Reading level"
            value={`Around US grade ${readability.gradeLevel}`}
          />
          <Row
            label="Average sentence"
            value={`${readability.meanSentenceLength} words`}
          />
          <Row
            label="Sentences over 30 words"
            value={formatNumber(readability.longSentenceCount)}
          />
          <Row label="Sentences" value={formatNumber(readability.sentenceCount)} />
        </dl>

        <p className="text-xs text-foreground-subtle">
          These formulas are calibrated on English and are approximate. Dense
          writing is not bad writing — specialist prose scores low by nature.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
