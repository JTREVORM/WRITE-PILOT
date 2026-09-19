/**
 * Meaning-preservation checks.
 *
 * Naturalize is a writing-improvement tool, and the one way it could genuinely
 * harm a user's work is by quietly losing something while "improving flow" — a
 * figure, a citation, the exact wording of a quotation. So the rewrite is
 * checked against the original for those specific things, and anything missing
 * is reported *to the user* rather than swallowed.
 *
 * The scope is deliberately narrow: numbers, citations, quotations and links.
 * These are unambiguous to detect and consequential to lose. General proper
 * nouns are not checked, because a rewrite legitimately rephrases around names
 * and flagging every one would bury the findings that matter in noise.
 */

export type IntegrityKind =
  | "number"
  | "citation"
  | "quotation"
  | "link"
  | "scope";

export interface IntegrityFinding {
  kind: IntegrityKind;
  /** The item from the original that could not be found in the rewrite. */
  value: string;
  /** What the user should do about it, in plain language. */
  message: string;
}

/** Numbers, percentages and years. Bare ordinals like "1st" count too. */
const NUMBER_PATTERN = /\b\d[\d,]*(?:\.\d+)?\s?%?/g;

/**
 * Parenthetical and narrative citations.
 *
 * The parenthetical form is matched loosely — a bracketed run that starts with
 * a capital and ends in a year — because the author part varies so much
 * ("Smith, 2019", "Smith & Jones, 2019", "Smith et al., 2019", "Smith et al.
 * 2019"). Requiring a four-digit year inside brackets keeps the false-positive
 * rate low enough to be worth reporting.
 */
const CITATION_PATTERNS = [
  /\([A-Z][^()]{0,80}?\b\d{4}[a-z]?\)/g,
  /\b[A-Z][\w'’-]+(?:\s+(?:et al\.|and|&|[A-Z][\w'’-]+))*\s*\(\d{4}[a-z]?\)/g,
];

/** Straight and smart double quotes, and single-quoted runs of some length. */
const QUOTATION_PATTERN = /[“"]([^“”"]{8,300})[”"]/g;

const LINK_PATTERN = /\b(?:https?:\/\/|www\.|10\.\d{4,9}\/)[^\s)"'<>]+/gi;

function extract(text: string, pattern: RegExp): string[] {
  // Patterns are module-level and carry lastIndex, so reset before each use.
  pattern.lastIndex = 0;
  return (text.match(pattern) ?? []).map((match) => match.trim()).filter(Boolean);
}

/** Comparison key: punctuation and spacing differences are not losses. */
function key(value: string): string {
  return value.toLowerCase().replace(/[\s.,;:]+/g, "");
}

function missing(originalItems: string[], improved: string): string[] {
  const haystack = key(improved);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of originalItems) {
    const itemKey = key(item);
    if (!itemKey || seen.has(itemKey)) continue;
    seen.add(itemKey);

    if (!haystack.includes(itemKey)) result.push(item);
  }

  return result;
}

export interface IntegrityOptions {
  /** Share of the original's words that survived, from the diff. */
  retention?: number;
  /** "concise" is expected to cut text, so a low retention is not a finding. */
  mode?: string;
}

export function checkIntegrity(
  original: string,
  improved: string,
  options: IntegrityOptions = {},
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  const citations = CITATION_PATTERNS.flatMap((pattern) =>
    extract(original, pattern),
  );
  const links = extract(original, LINK_PATTERN);

  // A year inside a citation, or a number inside a DOI, is already covered by
  // that item's own check. Reporting it separately would give the user two
  // findings for one loss and bury the one that names the cause.
  const coveredKeys = [...citations, ...links].map(key);
  const isCovered = (value: string) => {
    const valueKey = key(value);
    return coveredKeys.some((covered) => covered.includes(valueKey));
  };

  const numbers = extract(original, NUMBER_PATTERN).filter(
    (value) => !isCovered(value),
  );

  for (const value of missing(numbers, improved)) {
    findings.push({
      kind: "number",
      value,
      message: `The figure ${value} appears in your original but not in the rewrite. Check it wasn't dropped.`,
    });
  }

  for (const value of missing(citations, improved)) {
    findings.push({
      kind: "citation",
      value,
      message: `The citation ${value} is missing from the rewrite. Put it back before you use this text.`,
    });
  }

  for (const value of missing(extract(original, QUOTATION_PATTERN), improved)) {
    findings.push({
      kind: "quotation",
      value: value.length > 80 ? `${value.slice(0, 80)}…` : value,
      message:
        "A direct quotation was altered. Quoted material must stay exactly as the source wrote it.",
    });
  }

  for (const value of missing(links, improved)) {
    findings.push({
      kind: "link",
      value,
      message: `The link or DOI ${value} is missing from the rewrite.`,
    });
  }

  // A rewrite that keeps almost none of the original wording may have drifted
  // from what the writer meant. Expected when the mode is explicitly cutting.
  const retention = options.retention;
  if (
    typeof retention === "number" &&
    retention < 0.35 &&
    options.mode !== "concise" &&
    options.mode !== "simple"
  ) {
    findings.push({
      kind: "scope",
      value: `${Math.round(retention * 100)}% of the original wording kept`,
      message:
        "This is a substantial rewrite rather than a polish. Read it closely to be sure it still says what you meant.",
    });
  }

  return findings;
}
