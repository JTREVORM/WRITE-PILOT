/**
 * Cross-matching the text against the reference list.
 *
 * These are the findings WritePilot can state as fact rather than judgement: a
 * source cited three times and never listed is missing, and no amount of
 * stylistic opinion changes that. They are produced locally, they cost no
 * credits to compute, and they are labelled in the interface as checked rather
 * than assessed — a user is entitled to know which half of a report is
 * arithmetic and which half is a model's reading.
 */

import type { InTextCitation, ParsedDocument, ReferenceEntry } from "./parse.ts";
import type { CitationStyle } from "./styles.ts";

export type LocalFindingKind =
  | "orphan_citation"
  | "uncited_reference"
  | "year_mismatch"
  | "duplicate_reference"
  | "missing_list"
  | "numeric_style"
  | "no_citations";

export type FindingSeverity = "error" | "warning" | "info";

export interface LocalFinding {
  kind: LocalFindingKind;
  severity: FindingSeverity;
  /** The citation or entry the finding is about, as written. */
  target: string;
  message: string;
  /** What to do about it. Empty when the fix is obvious from the message. */
  suggestion: string | null;
  /** Index into the parsed reference list, when the finding is about an entry. */
  entryPosition: number | null;
}

export interface CitationCoverage {
  inTextCount: number;
  /** Distinct works cited, not occurrences. */
  distinctSources: number;
  referenceCount: number;
  matchedCount: number;
  orphanCount: number;
  uncitedCount: number;
}

/** A citation and a reference agree when the first surname and the year do. */
function citationKey(citation: InTextCitation): string {
  return `${citation.authors[0] ?? ""}|${citation.year ?? ""}`;
}

function entryKeys(entry: ReferenceEntry): string[] {
  const first = entry.authors[0] ?? "";
  return [`${first}|${entry.year ?? ""}`, `${first}|`];
}

/**
 * A reference entry's identity for duplicate detection.
 *
 * Punctuation and spacing vary between a copied entry and a retyped one, so the
 * comparison is on letters and digits only.
 */
function entryIdentity(entry: ReferenceEntry): string {
  return entry.raw.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 120);
}

export function matchCitations(
  parsed: ParsedDocument,
  style: CitationStyle,
): { findings: LocalFinding[]; coverage: CitationCoverage } {
  const findings: LocalFinding[] = [];

  const authorDateCitations = parsed.citations.filter((c) => c.kind !== "numeric");
  const numericCitations = parsed.citations.filter((c) => c.kind === "numeric");

  // Index the reference list both ways: with the year, for an exact match, and
  // without, so a year that disagrees is reported as a mismatch rather than as
  // a missing source. The two are different problems with different fixes.
  const byKey = new Map<string, ReferenceEntry>();
  const bySurname = new Map<string, ReferenceEntry[]>();

  for (const entry of parsed.entries) {
    for (const key of entryKeys(entry)) {
      if (!byKey.has(key)) byKey.set(key, entry);
    }

    const surname = entry.authors[0] ?? "";
    if (!surname) continue;
    bySurname.set(surname, [...(bySurname.get(surname) ?? []), entry]);
  }

  const matchedEntries = new Set<number>();
  const reportedOrphans = new Set<string>();
  const reportedMismatches = new Set<string>();
  let matchedCount = 0;

  for (const citation of authorDateCitations) {
    const surname = citation.authors[0] ?? "";
    const exact = byKey.get(citationKey(citation));

    if (exact) {
      matchedEntries.add(exact.position);
      matchedCount += 1;
      continue;
    }

    const sameAuthor = bySurname.get(surname) ?? [];

    if (sameAuthor.length > 0 && citation.year) {
      // The source is listed; the years disagree. Which one is wrong is not
      // ours to decide, so both are shown.
      const entry = sameAuthor[0];
      matchedEntries.add(entry.position);

      const key = `${surname}|${citation.year}|${entry.year}`;
      if (!reportedMismatches.has(key)) {
        reportedMismatches.add(key);
        findings.push({
          kind: "year_mismatch",
          severity: "warning",
          target: citation.raw,
          message:
            `The text cites ${citation.year}, but the reference list gives ` +
            `${entry.year ?? "no year"} for this source.`,
          suggestion:
            "Check which year is right and make the two agree. If these really " +
            "are different works by the same author, the reference list needs " +
            "both, distinguished by a letter after the year.",
          entryPosition: entry.position,
        });
      }
      continue;
    }

    const key = citationKey(citation);
    if (reportedOrphans.has(key)) continue;
    reportedOrphans.add(key);

    findings.push({
      kind: "orphan_citation",
      severity: "error",
      target: citation.raw,
      message: parsed.entries.length
        ? "This is cited in the text but does not appear in the reference list."
        : "This is cited in the text, and no reference list was found.",
      suggestion: `Add a full entry for this source to your ${style.listHeading.toLowerCase()}.`,
      entryPosition: null,
    });
  }

  for (const entry of parsed.entries) {
    if (matchedEntries.has(entry.position)) continue;

    findings.push({
      kind: "uncited_reference",
      severity: "warning",
      target: entry.raw,
      message: "This is in the reference list but is never cited in the text.",
      suggestion:
        "Either cite it where you used it, or remove it. Most styles list only " +
        "the works you actually cited.",
      entryPosition: entry.position,
    });
  }

  const seen = new Map<string, number>();
  for (const entry of parsed.entries) {
    const identity = entryIdentity(entry);
    if (!identity) continue;

    const first = seen.get(identity);
    if (first === undefined) {
      seen.set(identity, entry.position);
      continue;
    }

    findings.push({
      kind: "duplicate_reference",
      severity: "warning",
      target: entry.raw,
      message: `This entry also appears at position ${first + 1} in the list.`,
      suggestion: "Remove the duplicate.",
      entryPosition: entry.position,
    });
  }

  if (authorDateCitations.length > 0 && parsed.entries.length === 0) {
    findings.push({
      kind: "missing_list",
      severity: "error",
      target: style.listHeading,
      message:
        `No reference list was found. ${style.label} needs a "${style.listHeading}" ` +
        "section listing every source cited.",
      suggestion:
        `Add a "${style.listHeading}" heading at the end, with one entry per source.`,
      entryPosition: null,
    });
  }

  if (numericCitations.length > 0) {
    findings.push({
      kind: "numeric_style",
      severity: "warning",
      target: numericCitations[0].raw,
      message:
        `This document uses numbered citations like ${numericCitations[0].raw}, ` +
        `which ${style.label} does not use.`,
      suggestion: `${style.label} cites in the form ${style.inTextExample}.`,
      entryPosition: null,
    });
  }

  if (parsed.citations.length === 0) {
    findings.push({
      kind: "no_citations",
      severity: "info",
      target: "",
      message:
        "No in-text citations were found. If this text should cite sources, " +
        "nothing here is attributed yet.",
      suggestion: null,
      entryPosition: null,
    });
  }

  const distinct = new Set(authorDateCitations.map(citationKey));

  return {
    findings,
    coverage: {
      inTextCount: parsed.citations.length,
      distinctSources: distinct.size,
      referenceCount: parsed.entries.length,
      matchedCount,
      orphanCount: findings.filter((f) => f.kind === "orphan_citation").length,
      uncitedCount: findings.filter((f) => f.kind === "uncited_reference").length,
    },
  };
}
