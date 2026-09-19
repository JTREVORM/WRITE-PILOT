/**
 * Merging the two halves of a citation check into one list.
 *
 * The local findings and the model's findings arrive separately and must not be
 * blended into an undifferentiated pile of "issues". Each row keeps its origin
 * so the interface can say which were counted and which were judged, and the
 * local ones are never dropped or reordered behind the model's.
 */

import type { LocalFinding } from "./match.ts";
import type { CitationReview } from "./prompt.ts";

export interface PreparedFinding {
  origin: "local" | "model";
  kind: string;
  severity: "error" | "warning" | "info";
  target: string;
  message: string;
  suggestion: string | null;
  entryPosition: number | null;
}

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 } as const;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildFindingRows(input: {
  localFindings: LocalFinding[];
  review: CitationReview;
  entryCount: number;
}): PreparedFinding[] {
  const local: PreparedFinding[] = input.localFindings.map((finding) => ({
    origin: "local",
    kind: finding.kind,
    severity: finding.severity,
    target: finding.target,
    message: finding.message,
    suggestion: finding.suggestion,
    entryPosition: finding.entryPosition,
  }));

  // The prompt tells the model that presence-in-the-list has already been
  // checked, but a model that repeats it anyway must not produce a second row
  // saying the same thing about the same source in weaker terms.
  const claimedTargets = new Set(local.map((finding) => normalize(finding.target)));
  const seen = new Set<string>();
  const model: PreparedFinding[] = [];

  for (const finding of input.review.findings) {
    const message = finding.message?.trim();
    if (!message) continue;

    const target = finding.target?.trim() ?? "";
    if (target && claimedTargets.has(normalize(target))) continue;

    // Two findings about the same text saying the same thing are one finding;
    // two saying different things are two.
    const key = `${normalize(target)}|${normalize(message)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const hasEntry =
      Number.isInteger(finding.entry_index) &&
      finding.entry_index >= 0 &&
      finding.entry_index < input.entryCount;

    model.push({
      origin: "model",
      kind: "format",
      severity: finding.severity,
      target,
      message,
      suggestion: finding.suggestion?.trim() || null,
      entryPosition: hasEntry ? finding.entry_index : null,
    });
  }

  const bySeverity = (a: PreparedFinding, b: PreparedFinding) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

  return [...local.sort(bySeverity), ...model.sort(bySeverity)];
}
