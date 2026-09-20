import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";
import type { AdminOverview } from "@/lib/admin/queries";

/**
 * Which tools are actually used.
 *
 * A ranking by magnitude, so it is one hue and sorted — nine features in nine
 * categorical colours would be a colour-matching exercise, and the reader's
 * question here is "which is biggest", not "which is which". The bar is the
 * comparison; the number beside it is the value, so nothing depends on
 * estimating a length.
 *
 * Failures are shown as a count with the word "failed" beside them. A red bar
 * segment would encode a state as colour alone.
 */
export function FeatureUsage({
  usage,
  className,
}: {
  usage: AdminOverview["usage30d"];
  className?: string;
}) {
  if (usage.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-foreground-muted">
        No runs in the last 30 days.
      </p>
    );
  }

  const peak = Math.max(...usage.map((entry) => entry.runs));

  return (
    <ol aria-label="Tools by runs" className={cn("space-y-2.5", className)}>
      {usage.map((entry) => (
        <li key={entry.featureKey}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm">{entry.featureName}</span>
            <span className="shrink-0 text-sm tabular-nums">
              {formatNumber(entry.runs)}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand-600 dark:bg-brand-500"
                style={{ width: `${peak > 0 ? (entry.runs / peak) * 100 : 0}%` }}
              />
            </div>

            {entry.failures > 0 ? (
              <span className="shrink-0 text-[11px] tabular-nums text-danger-700 dark:text-danger-500">
                {formatNumber(entry.failures)} failed
              </span>
            ) : null}
            {entry.rejections > 0 ? (
              <span className="shrink-0 text-[11px] tabular-nums text-foreground-subtle">
                {formatNumber(entry.rejections)} blocked
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
