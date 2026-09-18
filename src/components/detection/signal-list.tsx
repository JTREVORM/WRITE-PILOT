import { cn } from "@/lib/utils/cn";
import type { WritingSignal } from "@/lib/detection/signals";

const LEAN_COPY: Record<WritingSignal["lean"], { label: string; className: string }> = {
  varied: {
    label: "Varied",
    className: "text-success-700 dark:text-success-500",
  },
  neutral: { label: "Typical", className: "text-foreground-muted" },
  uniform: {
    label: "Uniform",
    className: "text-warning-700 dark:text-warning-500",
  },
};

/**
 * The measured writing patterns.
 *
 * These are computed from the text itself, not produced by a model, which makes
 * them the part of the result a user can check and reproduce. They are phrased
 * as observations about the writing — a human writer can read as "uniform" on
 * every one of them, and the wording never implies otherwise.
 */
export function SignalList({ signals }: { signals: WritingSignal[] }) {
  if (signals.length === 0) return null;

  return (
    <dl className="divide-y divide-line">
      {signals.map((signal) => {
        const lean = LEAN_COPY[signal.lean];

        return (
          <div
            key={signal.key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium">{signal.label}</dt>
              <dd className="mt-0.5 text-xs text-foreground-muted">
                {signal.description}
              </dd>
            </div>

            <dd className="flex shrink-0 items-baseline gap-2">
              <span className="text-sm tabular-nums text-foreground">
                {signal.value}
              </span>
              <span className={cn("text-xs font-medium", lean.className)}>
                {lean.label}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
