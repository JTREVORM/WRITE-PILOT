/**
 * Pure text helpers used by extraction.
 *
 * Kept free of server-only imports so they can be unit tested directly — these
 * are the functions that decide where paragraphs begin and end, which is what
 * the whole paragraph-level result is built on.
 */

/**
 * Collapses the whitespace a PDF or DOCX extractor leaves behind, without
 * destroying paragraph structure — the paragraph breaks are what the segment
 * view is built from.
 */
export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Soft hyphen and zero-width characters, common in PDF text layers.
    .replace(/[­​-‍﻿]/g, "")
    // Join words split across a line break by hyphenation.
    .replace(/(\w)-\n(\w)/g, "$1$2")
    // Trailing spaces before a newline.
    .replace(/[ \t]+\n/g, "\n")
    // Three or more newlines collapse to a single paragraph break.
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A short, human title for a scan, from the document name or its first line. */
export function deriveTitle(params: {
  filename?: string | null;
  text: string;
}): string {
  const fromFile = params.filename?.replace(/\.[^.]+$/, "").trim();
  if (fromFile) return fromFile.slice(0, 120);

  const firstLine = params.text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return "Untitled scan";

  const trimmed = firstLine.slice(0, 80).trim();
  return trimmed.length < firstLine.length ? `${trimmed}…` : trimmed;
}
