/**
 * Word-level diff between an original passage and its rewrite.
 *
 * Showing two blocks of prose side by side and asking the writer to spot the
 * differences is not a comparison — it is homework. This produces the runs a
 * reader can actually scan: what was kept, what was removed, what was added.
 *
 * Implemented as a longest-common-subsequence over tokens. Tokens are words
 * *with* their trailing whitespace and punctuation attached, so the diff can be
 * reassembled into the exact original or the exact rewrite without guessing
 * where the spaces went.
 */

export type DiffKind = "equal" | "removed" | "added";

export interface DiffRun {
  kind: DiffKind;
  /** What to show for this run. For `equal`, the rewrite's rendering. */
  text: string;
  /**
   * The original rendering of the same run.
   *
   * Tokens compare case- and whitespace-insensitively, so an `equal` run can
   * still differ between the two texts ("to" vs "To"). Keeping both is what
   * lets either side be reassembled exactly; without it, reconstructing the
   * original would hand back the rewrite's capitalisation.
   */
  originalText: string;
}

/**
 * Splits into comparable tokens.
 *
 * Each token carries the whitespace that *precedes* it, plus a final token for
 * any trailing whitespace. That gives the guarantee the whole comparison rests
 * on: `tokenize(x).join("") === x` for every input, including one that starts
 * or ends with spaces.
 *
 * Punctuation stays attached to its word, because a change from "however," to
 * "however;" should read as one edit rather than three.
 */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+|\s+$/g) ?? [];
}

/** The comparison key: case and surrounding whitespace are not edits. */
function normalize(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * Longest common subsequence over tokens, as a table of lengths.
 *
 * O(n*m) in time and memory. Paragraphs are bounded by the per-request word
 * limit, and the diff runs per paragraph rather than per document, so the table
 * stays small; `diffWords` guards the pathological case explicitly.
 */
function lcsTable(a: string[], b: string[]): Uint32Array[] {
  const table: Uint32Array[] = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        normalize(a[i]!) === normalize(b[j]!)
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  return table;
}

/** Guard for pathologically long passages, where the table would be huge. */
const MAX_DIFF_TOKENS = 4000;

export function diffWords(original: string, improved: string): DiffRun[] {
  if (original === improved) {
    return original
      ? [{ kind: "equal", text: original, originalText: original }]
      : [];
  }

  const a = tokenize(original);
  const b = tokenize(improved);

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) {
    return [{ kind: "added", text: improved, originalText: "" }];
  }
  if (b.length === 0) {
    return [{ kind: "removed", text: original, originalText: original }];
  }

  // Beyond this, fall back to reporting the whole passage as rewritten rather
  // than allocating a table of tens of millions of cells.
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    return [
      { kind: "removed", text: original, originalText: original },
      { kind: "added", text: improved, originalText: "" },
    ];
  }

  const table = lcsTable(a, b);
  const runs: DiffRun[] = [];

  let i = 0;
  let j = 0;

  const push = (kind: DiffKind, text: string, originalText: string) => {
    const last = runs.at(-1);
    // Merge adjacent runs of the same kind so the output reads as phrases
    // rather than a stutter of single words.
    if (last && last.kind === kind) {
      last.text += text;
      last.originalText += originalText;
    } else {
      runs.push({ kind, text, originalText });
    }
  };

  while (i < a.length && j < b.length) {
    if (normalize(a[i]!) === normalize(b[j]!)) {
      // Equal by comparison key, but the two sides may still render the token
      // differently, so both are kept.
      push("equal", b[j]!, a[i]!);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      push("removed", a[i]!, a[i]!);
      i += 1;
    } else {
      push("added", b[j]!, "");
      j += 1;
    }
  }

  while (i < a.length) {
    push("removed", a[i]!, a[i]!);
    i += 1;
  }
  while (j < b.length) {
    push("added", b[j]!, "");
    j += 1;
  }

  return runs;
}

export interface DiffStats {
  /** Tokens present in both, by the comparison key. */
  kept: number;
  removed: number;
  added: number;
  /** Share of the original's tokens that survived, 0-1. */
  retention: number;
}

export function diffStats(runs: DiffRun[]): DiffStats {
  let kept = 0;
  let removed = 0;
  let added = 0;

  for (const run of runs) {
    // Whitespace-only tokens are not words and should not inflate the counts.
    const count = tokenize(run.text).filter((token) => token.trim()).length;
    if (run.kind === "equal") kept += count;
    else if (run.kind === "removed") removed += count;
    else added += count;
  }

  const originalTokens = kept + removed;

  return {
    kept,
    removed,
    added,
    retention: originalTokens > 0 ? kept / originalTokens : 1,
  };
}

/** Reassembles one side of the diff, for verifying a round trip. */
export function reconstruct(runs: DiffRun[], side: "original" | "improved"): string {
  if (side === "original") {
    return runs
      .filter((run) => run.kind !== "added")
      .map((run) => run.originalText)
      .join("");
  }

  return runs
    .filter((run) => run.kind !== "removed")
    .map((run) => run.text)
    .join("");
}
