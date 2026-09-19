/**
 * Reading citations out of a document.
 *
 * Everything in this module is deterministic. The checks that matter most to a
 * student — "I cited this and it is not in my reference list" — are pure
 * bookkeeping, and bookkeeping is the last thing that should be handed to a
 * language model. The model's job starts later, and only on formatting.
 *
 * Extraction is lossy by nature: a PDF gives us characters, not italics or
 * hanging indents, and every heuristic here is tuned to under-claim rather than
 * over-claim. A citation this module misses costs the user nothing; a citation
 * it invents would send them hunting for a problem that is not there.
 *
 * Naturalize has its own, narrower citation regex (`lib/naturalize/integrity`),
 * which answers a different question — "did this disappear in the rewrite?" —
 * and deliberately stays as loose as it is. This module needs the parts, not
 * just the presence, so it parses rather than matches.
 */

import { ALL_LIST_HEADINGS } from "./styles.ts";

export type InTextKind = "parenthetical" | "narrative" | "numeric";

export interface InTextCitation {
  /** Exactly as it appears in the document. */
  raw: string;
  /** Offset into the body text, so the interface can show it in context. */
  start: number;
  end: number;
  kind: InTextKind;
  /** Lowercased surnames, in the order written. Empty for numeric styles. */
  authors: string[];
  year: string | null;
  /** True when the author list was abbreviated with "et al." */
  etAl: boolean;
}

export interface ReferenceEntry {
  position: number;
  raw: string;
  /** Lowercased surnames read from the front of the entry. */
  authors: string[];
  year: string | null;
  hasLink: boolean;
}

export interface ParsedDocument {
  /** The document with the reference list removed. */
  body: string;
  /** The heading the list was found under, as written. */
  listHeading: string | null;
  /** The reference list, verbatim. */
  listText: string;
  entries: ReferenceEntry[];
  citations: InTextCitation[];
}

/**
 * Parenthetical asides that are not citations.
 *
 * "(Table 2)" and "(Figure 3)" have exactly the shape of an MLA citation, and
 * flagging them as uncited sources would be the most annoying possible false
 * positive. The list is short on purpose: these are the cross-references that
 * actually occur in academic prose.
 */
const NON_CITATION_LEADS = new Set([
  "table", "tables", "figure", "figures", "fig", "figs", "eq", "equation",
  "section", "sections", "chapter", "chapters", "appendix", "appendices",
  "note", "notes", "step", "steps", "item", "items", "panel", "panels",
  "n", "p", "m", "sd", "se", "ci", "df", "r", "t", "f",
]);

/** Words that introduce a citation without being part of the author list. */
const CITATION_PREFIXES =
  /^(?:see also|see e\.?g\.?|see|e\.?g\.?|i\.?e\.?|cf\.?|as cited in|cited in|quoted in|adapted from|after)[,.\s]+/i;

const YEAR = /\b(1[5-9]\d{2}|20\d{2})([a-z])?\b/;

/**
 * Author-ish token: a capitalised word of at least two letters, possibly
 * hyphenated or carrying a particle. Two letters is what excludes initials —
 * "Okonkwo, A." must read as one author, not two.
 */
const SURNAME = /^(?:d[eiu]|van|von|der|den|del|della|la|le|st\.?|mac|mc|al)?[-'’]?[A-Z][\w'’-]+$/;

function lower(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.'’]/g, "")
    .trim();
}

/**
 * Pulls surnames out of the author part of a citation.
 *
 * Only capitalised tokens survive, so connectives ("and", "et al.") and
 * introductory words drop out without needing to be enumerated.
 */
function readAuthors(fragment: string): { authors: string[]; etAl: boolean } {
  const cleaned = fragment.replace(CITATION_PREFIXES, "");
  const etAl = /\bet\s+al\b/i.test(cleaned);

  const authors: string[] = [];
  for (const part of cleaned.split(/\s*(?:[,;&]|\band\b|\bet\s+al\.?)\s*/i)) {
    const tokens = part
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/[.,;:]+$/, ""))
      .filter(Boolean);
    // A surname is the last capitalised token of the part: "A. Okonkwo" and
    // "Okonkwo, A." both reduce to "okonkwo".
    const surname = [...tokens].reverse().find((token) => SURNAME.test(token));
    if (surname) authors.push(lower(surname));
  }

  return { authors: [...new Set(authors)], etAl };
}

function readYear(fragment: string): string | null {
  const match = fragment.match(YEAR);
  return match ? match[1] : null;
}

/**
 * Finds the reference list and separates it from the prose.
 *
 * The *last* matching heading wins: a document with a table of contents names
 * its reference list twice, and the real list is the one at the end.
 */
export function splitReferenceList(text: string): {
  body: string;
  listHeading: string | null;
  listText: string;
} {
  const lines = text.split(/\r?\n/);
  let headingIndex = -1;
  let heading: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    // Tolerates numbering, markdown hashes and trailing colons around the word.
    const candidate = lines[index]
      .trim()
      .replace(/^#+\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/[:.]$/, "")
      .toLowerCase();

    if (candidate && ALL_LIST_HEADINGS.includes(candidate)) {
      headingIndex = index;
      heading = lines[index].trim();
    }
  }

  if (headingIndex === -1) {
    return { body: text, listHeading: null, listText: "" };
  }

  return {
    body: lines.slice(0, headingIndex).join("\n").trimEnd(),
    listHeading: heading,
    listText: lines.slice(headingIndex + 1).join("\n").trim(),
  };
}

/**
 * Splits a reference list into entries.
 *
 * Two layouts survive extraction. Either entries are separated by blank lines,
 * or they are wrapped with a hanging indent and a blank line never appears. The
 * blank-line case is unambiguous, so it is tried first; otherwise a line starts
 * a new entry only when the one being built already looks complete — it has a
 * year — and the new line begins the way an entry begins.
 */
export function splitEntries(listText: string): string[] {
  const trimmed = listText.trim();
  if (!trimmed) return [];

  const byBlankLine = trimmed
    .split(/\n\s*\n/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (byBlankLine.length > 1) return byBlankLine;

  const entries: string[] = [];
  let current = "";

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const indented = /^\s+/.test(rawLine);
    const looksLikeStart = /^[\[(]?[A-Z0-9"“'‘]/.test(line);
    const currentLooksComplete = YEAR.test(current);

    if (current && !indented && looksLikeStart && currentLooksComplete) {
      entries.push(current.trim());
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }

  if (current.trim()) entries.push(current.trim());

  return entries.map((entry) => entry.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * The author block at the front of a reference entry.
 *
 * Where it ends depends on the style: APA and Harvard put the year straight
 * after the authors, MLA and Chicago put the title there instead. Rather than
 * branching on the style — which the user may have chosen wrongly, and which is
 * part of what we are checking — the block ends at whichever comes first: the
 * year, an opening quotation mark, or a full stop that is not an initial's.
 */
function authorBlock(raw: string): string {
  const cleaned = raw.replace(/^\[\d+\]\s*/, "").replace(/^\d+[.)]\s*/, "");

  const cuts = [
    cleaned.search(YEAR),
    // An apostrophe inside O'Brien is not a title delimiter; an opening quote
    // after whitespace is.
    cleaned.search(/["“]|(?<=\s)['‘](?=[A-Z])/),
    cleaned.search(/(?<![A-Z])\.\s/),
  ].filter((index) => index > 0);

  return cuts.length ? cleaned.slice(0, Math.min(...cuts)) : cleaned;
}

/**
 * Reads one reference entry.
 *
 * `authors[0]` is the matching key and is reliable — every supported style
 * inverts the first author, so the entry opens with a surname. The rest of the
 * list is best-effort: in the styles that spell given names out in full, a
 * first name can look exactly like a surname, and nothing downstream depends on
 * telling them apart.
 */
export function parseEntry(raw: string, position: number): ReferenceEntry {
  const yearMatch = raw.match(YEAR);

  return {
    position,
    raw,
    ...readAuthors(authorBlock(raw)),
    year: yearMatch ? yearMatch[1] : null,
    hasLink: /\b(?:https?:\/\/|www\.|doi:|10\.\d{4,9}\/)/i.test(raw),
  };
}

/** Parenthetical citations: "(Okonkwo & Silva, 2021)", "(Okonkwo 118)". */
function findParenthetical(body: string): InTextCitation[] {
  const found: InTextCitation[] = [];
  const pattern = /\(([^()]{2,200})\)/g;

  for (const match of body.matchAll(pattern)) {
    const inner = match[1].trim();
    const start = match.index ?? 0;

    // Several works in one bracket, separated by semicolons, are separate
    // citations and must each find a reference. Each carries its own offset:
    // sharing the bracket's span would make them overlap, and the overlap pass
    // below would keep only the first.
    let cursor = match[0].indexOf(inner);
    for (const part of inner.split(/(?=;)|(?<=;)/).filter((piece) => piece !== ";")) {
      const fragment = part.trim();
      const offset = cursor + part.indexOf(fragment.slice(0, 1) || " ");
      cursor += part.length + 1;
      if (!fragment) continue;

      const stripped = fragment.replace(CITATION_PREFIXES, "");
      const firstWord = lower(stripped.split(/[\s,]+/)[0] ?? "");
      if (NON_CITATION_LEADS.has(firstWord)) continue;

      const year = readYear(fragment);
      const hasPage = /\b(?:pp?\.\s*)?\d{1,4}(?:[-–]\d{1,4})?\s*$/.test(fragment);
      if (!year && !hasPage) continue;

      const { authors, etAl } = readAuthors(
        year ? stripped.slice(0, stripped.search(YEAR)) : stripped,
      );
      // No capitalised name means this is a measurement or an aside, not a
      // citation. "(2021)" alone is handled by the narrative pass.
      if (authors.length === 0) continue;

      const isWholeBracket = fragment === inner;
      found.push({
        raw: isWholeBracket ? match[0] : `(${fragment})`,
        start: isWholeBracket ? start : start + offset,
        end: isWholeBracket ? start + match[0].length : start + offset + fragment.length,
        kind: "parenthetical",
        authors,
        year,
        etAl,
      });
    }
  }

  return found;
}

/** Narrative citations: "Okonkwo and Silva (2021) found…". */
function findNarrative(body: string): InTextCitation[] {
  const found: InTextCitation[] = [];
  const pattern =
    /\b([A-Z][\w'’-]+(?:\s+(?:et\s+al\.|and|&|[A-Z][\w'’-]+))*)\s*\((\d{4}[a-z]?)\)/g;

  for (const match of body.matchAll(pattern)) {
    const { authors, etAl } = readAuthors(match[1]);
    if (authors.length === 0) continue;

    found.push({
      raw: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      kind: "narrative",
      authors,
      year: match[2].slice(0, 4),
      etAl,
    });
  }

  return found;
}

/** Numeric citations: "[12]", "[1, 3–5]". Not one of our styles — that is the point. */
function findNumeric(body: string): InTextCitation[] {
  const found: InTextCitation[] = [];
  const pattern = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g;

  for (const match of body.matchAll(pattern)) {
    found.push({
      raw: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      kind: "numeric",
      authors: [],
      year: null,
      etAl: false,
    });
  }

  return found;
}

export function parseDocument(text: string): ParsedDocument {
  const { body, listHeading, listText } = splitReferenceList(text);

  const citations = [
    ...findParenthetical(body),
    ...findNarrative(body),
    ...findNumeric(body),
  ].sort((a, b) => a.start - b.start);

  // A narrative citation contains its own parenthetical year, so the two passes
  // can both claim the same span. The narrative reading is the fuller one.
  const deduped: InTextCitation[] = [];
  for (const citation of citations) {
    const overlapping = deduped.findIndex(
      (existing) => citation.start < existing.end && existing.start < citation.end,
    );

    if (overlapping === -1) {
      deduped.push(citation);
      continue;
    }

    if (citation.kind === "narrative" && deduped[overlapping].kind !== "narrative") {
      deduped[overlapping] = citation;
    }
  }

  return {
    body,
    listHeading,
    listText,
    entries: splitEntries(listText).map(parseEntry),
    citations: deduped,
  };
}
