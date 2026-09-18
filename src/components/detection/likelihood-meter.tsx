import { CheckCircle2, CircleAlert, CircleHelp, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { bandFor, type LikelihoodBand } from "@/lib/detection/scoring";

const BAND_STYLES: Record<
  LikelihoodBand["key"],
  { fill: string; track: string; text: string; icon: typeof CheckCircle2 }
> = {
  low: {
    fill: "bg-detect-low",
    track: "bg-detect-low-track",
    text: "text-success-700 dark:text-success-500",
    icon: CheckCircle2,
  },
  moderate: {
    fill: "bg-detect-moderate",
    track: "bg-detect-moderate-track",
    text: "text-brand-700 dark:text-brand-300",
    icon: CircleHelp,
  },
  elevated: {
    fill: "bg-detect-elevated",
    track: "bg-detect-elevated-track",
    text: "text-warning-700 dark:text-warning-500",
    icon: TriangleAlert,
  },
  high: {
    fill: "bg-detect-high",
    track: "bg-detect-high-track",
    text: "text-danger-700 dark:text-danger-500",
    icon: CircleAlert,
  },
};

/**
 * The headline result.
 *
 * A single ratio against a limit, so it is a meter and a hero figure — not a
 * chart. The unfilled track is a lighter step of the fill's own hue, so the
 * state reads across the whole bar rather than only at the filled end.
 *
 * The severity colour never carries the meaning alone: every state ships with
 * an icon and a written label. That matters more than usual here, because the
 * number is an estimate and a colour alone would imply a verdict.
 *
 * The figure uses the sans face and proportional figures — `tabular-nums` gives
 * every digit the width of a zero, which reads loose at display sizes.
 */
export function LikelihoodMeter({
  likelihood,
  className,
}: {
  likelihood: number;
  className?: string;
}) {
  const band = bandFor(likelihood);
  const style = BAND_STYLES[band.key];
  const Icon = style.icon;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-muted">
            Estimated AI likelihood
          </p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight">
            {likelihood}
            <span className="ml-0.5 text-2xl text-foreground-subtle">%</span>
          </p>
        </div>

        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium",
            style.text,
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {band.label}
        </span>
      </div>

      <div
        role="meter"
        aria-valuenow={likelihood}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Estimated AI likelihood"
        className={cn("h-2 w-full overflow-hidden rounded-full", style.track)}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", style.fill)}
          style={{ width: `${Math.max(2, likelihood)}%` }}
        />
      </div>

      <p className="text-sm leading-relaxed text-foreground-muted">
        {band.summary}
      </p>
    </div>
  );
}

/** Compact variant for list rows, where the number sits beside a title. */
export function LikelihoodChip({ likelihood }: { likelihood: number }) {
  const band = bandFor(likelihood);
  const style = BAND_STYLES[band.key];
  const Icon = style.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs font-medium",
        style.text,
      )}
      title={band.label}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{likelihood}%</span>
      <span className="sr-only">{band.label}</span>
    </span>
  );
}
