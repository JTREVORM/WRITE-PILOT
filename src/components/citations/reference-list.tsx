import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { CitationEntryRow, CitationFindingRow } from "@/types/database";

/**
 * The reference list as it was parsed.
 *
 * Showing the parse back to the user is not decoration: if the checker read
 * three entries where the document has five, every count on this page is wrong,
 * and the user is the only person who can see that. So the list is shown as
 * understood, in order, with what was found against each entry.
 */
export function ReferenceList({
  entries,
  findings,
}: {
  entries: CitationEntryRow[];
  findings: CitationFindingRow[];
}) {
  if (entries.length === 0) return null;

  const byEntry = new Map<string, CitationFindingRow[]>();
  for (const finding of findings) {
    if (!finding.entry_id) continue;
    byEntry.set(finding.entry_id, [...(byEntry.get(finding.entry_id) ?? []), finding]);
  }

  return (
    <ol className="space-y-2">
      {entries.map((entry) => {
        const entryFindings = byEntry.get(entry.id) ?? [];
        const hasError = entryFindings.some((finding) => finding.severity === "error");

        return (
          <li key={entry.id}>
            <Card
              className={cn(
                "flex gap-3 p-4",
                hasError && "border-danger-200 dark:border-danger-700/40",
              )}
            >
              <span className="w-6 shrink-0 text-xs tabular-nums text-foreground-subtle">
                {entry.position + 1}
              </span>

              <div className="min-w-0 space-y-2">
                <p className="text-sm leading-relaxed break-words">{entry.raw_text}</p>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {entry.cited ? (
                    <span className="text-success-700 dark:text-success-500">
                      Cited in the text
                    </span>
                  ) : (
                    <span className="text-warning-700 dark:text-warning-500">
                      Never cited in the text
                    </span>
                  )}
                  {entry.has_link ? (
                    <span className="text-foreground-subtle">Has a DOI or URL</span>
                  ) : null}
                  {entryFindings.length > 0 ? (
                    <span className="text-foreground-subtle">
                      {entryFindings.length}{" "}
                      {entryFindings.length === 1 ? "finding" : "findings"} below
                    </span>
                  ) : null}
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
