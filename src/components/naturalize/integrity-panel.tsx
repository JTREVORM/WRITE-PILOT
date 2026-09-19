import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IntegrityFinding } from "@/lib/naturalize/integrity";

const KIND_LABELS: Record<IntegrityFinding["kind"], string> = {
  number: "Figure",
  citation: "Citation",
  quotation: "Quotation",
  link: "Link",
  scope: "Scope",
};

/**
 * What the rewrite may have lost.
 *
 * Shown prominently rather than buried, and shown even when it is empty — "we
 * checked and nothing is missing" is the reassurance a writer needs before they
 * use a rewrite of their own work.
 */
export function IntegrityPanel({
  findings,
}: {
  findings: IntegrityFinding[];
}) {
  const clean = findings.length === 0;

  return (
    <Card
      className={
        clean ? undefined : "border-warning-500/40 bg-warning-50/50 dark:bg-warning-700/10"
      }
    >
      <CardHeader className="flex-row items-center gap-2.5">
        {clean ? (
          <CheckCircle2
            className="size-4 shrink-0 text-success-600"
            aria-hidden="true"
          />
        ) : (
          <TriangleAlert
            className="size-4 shrink-0 text-warning-600"
            aria-hidden="true"
          />
        )}
        <CardTitle as="h2">
          {clean ? "Nothing was lost" : `${findings.length} thing${findings.length === 1 ? "" : "s"} to check`}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {clean ? (
          <p className="text-sm leading-relaxed text-foreground-muted">
            Every figure, citation, quotation and link in your original also
            appears in the rewrite. Still worth a read — this checks that things
            are present, not that the meaning is identical.
          </p>
        ) : (
          <ul className="space-y-3">
            {findings.map((finding, index) => (
              <li key={`${finding.kind}-${index}`} className="text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-foreground-muted">
                    {KIND_LABELS[finding.kind]}
                  </span>
                  <code className="font-mono text-xs text-foreground">
                    {finding.value}
                  </code>
                </span>
                <p className="mt-1 leading-relaxed text-foreground-muted">
                  {finding.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
