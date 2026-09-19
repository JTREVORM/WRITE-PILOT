import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";

/**
 * The counted figures.
 *
 * These are facts about the document, not judgements about it, so they are
 * presented as a plain count with no meter and no verdict. The one number worth
 * a colour is the count of sources cited but never listed, because that is the
 * one a student has to act on before submitting.
 */
export function CoverageSummary({
  inTextCount,
  distinctSources,
  referenceCount,
  orphanCount,
  uncitedCount,
  listHeading,
}: {
  inTextCount: number;
  distinctSources: number;
  referenceCount: number;
  orphanCount: number;
  uncitedCount: number;
  listHeading: string | null;
}) {
  const figures = [
    {
      label: "In-text citations",
      value: formatNumber(inTextCount),
      note: `${formatNumber(distinctSources)} distinct ${distinctSources === 1 ? "source" : "sources"}`,
      tone: "neutral" as const,
    },
    {
      label: "Reference entries",
      value: formatNumber(referenceCount),
      note: listHeading ? `Under "${listHeading}"` : "No reference list found",
      tone: referenceCount === 0 ? ("danger" as const) : ("neutral" as const),
    },
    {
      label: "Cited but not listed",
      value: formatNumber(orphanCount),
      note: orphanCount === 0 ? "Every citation has an entry" : "Add these entries",
      tone: orphanCount > 0 ? ("danger" as const) : ("success" as const),
    },
    {
      label: "Listed but not cited",
      value: formatNumber(uncitedCount),
      note: uncitedCount === 0 ? "Every entry is used" : "Cite or remove these",
      tone: uncitedCount > 0 ? ("warning" as const) : ("success" as const),
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((figure) => (
        <Card key={figure.label}>
          <CardContent className="p-4 pt-4">
            <dt className="text-xs font-medium text-foreground-muted">
              {figure.label}
            </dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                figure.tone === "danger" && "text-danger-700 dark:text-danger-500",
                figure.tone === "warning" && "text-warning-700 dark:text-warning-500",
                figure.tone === "success" && "text-success-700 dark:text-success-500",
              )}
            >
              {figure.value}
            </dd>
            <dd className="mt-0.5 text-xs text-foreground-subtle">{figure.note}</dd>
          </CardContent>
        </Card>
      ))}
    </dl>
  );
}
