import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils/cn";
import type { GradeCriterionRow } from "@/types/database";

/** The stored lists are jsonb; read them defensively. */
function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Per-criterion detail.
 *
 * This is where the grade becomes useful: what was asked for, what the work
 * did, what is missing, and what to change. The headline number is only a way
 * in — a student cannot act on "84/100", but they can act on "the argument
 * criterion asks for a counter-position and there isn't one".
 */
export function CriterionBreakdown({
  criteria,
}: {
  criteria: GradeCriterionRow[];
}) {
  if (criteria.length === 0) return null;

  return (
    <ol className="space-y-3">
      {criteria.map((criterion) => {
        const awarded = Number(criterion.awarded_points);
        const max = Number(criterion.max_points);
        const share = max > 0 ? awarded / max : null;

        const strengths = readList(criterion.strengths);
        const weaknesses = readList(criterion.weaknesses);
        const missing = readList(criterion.missing);
        const improvements = readList(criterion.improvements);

        return (
          <li key={criterion.id}>
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold">{criterion.name}</h3>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{awarded}</span>
                  <span className="text-foreground-subtle"> / {max}</span>
                </span>
              </div>

              {max > 0 ? (
                <Progress
                  className="mt-2.5"
                  value={awarded}
                  max={max}
                  label={`${criterion.name} score`}
                  tone={
                    share !== null && share >= 0.8
                      ? "brand"
                      : "auto"
                  }
                />
              ) : null}

              {criterion.explanation ? (
                <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                  {criterion.explanation}
                </p>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FeedbackList
                  title="What works"
                  items={strengths}
                  markerClass="bg-success-500"
                />
                <FeedbackList
                  title="What holds it back"
                  items={weaknesses}
                  markerClass="bg-warning-500"
                />
                <FeedbackList
                  title="Missing"
                  items={missing}
                  markerClass="bg-danger-500"
                />
                <FeedbackList
                  title="Do this next"
                  items={improvements}
                  markerClass="bg-brand-500"
                />
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function FeedbackList({
  title,
  items,
  markerClass,
}: {
  title: string;
  items: string[];
  markerClass: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm leading-relaxed">
            <span
              className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", markerClass)}
              aria-hidden="true"
            />
            <span className="text-foreground-muted">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
