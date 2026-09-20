import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/**
 * The headline figures.
 *
 * A number with a label is the right form for a single value: a chart of one
 * datum is decoration. Tone is used only where a figure is a *state* the reader
 * must act on, and it always ships with words — "3 failed" reads as a problem
 * because it says so, not because it is red.
 */
export interface Stat {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "warning" | "danger";
}

export function StatTiles({
  stats,
  className,
}: {
  stats: Stat[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4 pt-4">
            <dt className="text-xs font-medium text-foreground-muted">
              {stat.label}
            </dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                stat.tone === "warning" && "text-warning-700 dark:text-warning-500",
                stat.tone === "danger" && "text-danger-700 dark:text-danger-500",
              )}
            >
              {stat.value}
            </dd>
            {stat.note ? (
              <dd className="mt-0.5 text-xs text-foreground-subtle">{stat.note}</dd>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </dl>
  );
}
