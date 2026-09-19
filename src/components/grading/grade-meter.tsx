import { CircleAlert, CircleHelp, CheckCircle2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { bandFor, ESTIMATED_GRADE_LABEL, type GradeBand } from "@/lib/grading/score";

const BAND_STYLES: Record<
  GradeBand["key"],
  { fill: string; track: string; text: string; icon: typeof CheckCircle2 }
> = {
  strong: {
    fill: "bg-success-500",
    track: "bg-success-50 dark:bg-success-700/20",
    text: "text-success-700 dark:text-success-500",
    icon: CheckCircle2,
  },
  solid: {
    fill: "bg-brand-500",
    track: "bg-brand-100 dark:bg-brand-950",
    text: "text-brand-700 dark:text-brand-300",
    icon: CircleHelp,
  },
  developing: {
    fill: "bg-warning-500 dark:bg-warning-600",
    track: "bg-warning-50 dark:bg-warning-700/20",
    text: "text-warning-700 dark:text-warning-500",
    icon: TriangleAlert,
  },
  weak: {
    fill: "bg-danger-500",
    track: "bg-danger-50 dark:bg-danger-700/20",
    text: "text-danger-700 dark:text-danger-500",
    icon: CircleAlert,
  },
};

/**
 * The estimated grade.
 *
 * A single score against a maximum, so it is a meter and a hero figure rather
 * than a chart. The unfilled track is a lighter step of the fill's own hue, and
 * the band always ships with an icon and a written label — colour alone would
 * be a verdict nobody could read.
 *
 * The number is deliberately shown as "39 / 50" with the percentage secondary.
 * A bare percentage reads exactly like a mark; points against a stated maximum
 * keeps it tied to the rubric it came from.
 */
export function GradeMeter({
  awarded,
  max,
  percentage,
  className,
}: {
  awarded: number;
  max: number;
  percentage: number | null;
  className?: string;
}) {
  const band = bandFor(percentage);
  const style = BAND_STYLES[band.key];
  const Icon = style.icon;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-muted">
            {ESTIMATED_GRADE_LABEL}
          </p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight">
            {awarded}
            <span className="text-2xl text-foreground-subtle"> / {max}</span>
          </p>
          {percentage !== null ? (
            <p className="mt-1.5 text-sm text-foreground-muted">{percentage}%</p>
          ) : null}
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
        aria-valuenow={awarded}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={ESTIMATED_GRADE_LABEL}
        className={cn("h-2 w-full overflow-hidden rounded-full", style.track)}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", style.fill)}
          style={{ width: `${Math.max(2, percentage ?? 0)}%` }}
        />
      </div>

      <p className="text-sm leading-relaxed text-foreground-muted">{band.summary}</p>
    </div>
  );
}
