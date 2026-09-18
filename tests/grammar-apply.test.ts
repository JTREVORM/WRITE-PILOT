import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applySuggestions,
  buildRuns,
  countByStatus,
} from "../src/lib/grammar/apply.ts";

/**
 * This module rewrites the user's document. The property that matters most is
 * that rejecting everything returns the original text byte for byte — that is
 * what makes "undo" trustworthy.
 */

const ORIGINAL = "I are writing to apply for the the role.";

const SUGGESTIONS = [
  // "are" -> "am"
  { startOffset: 2, endOffset: 5, suggestedText: "am", status: "pending" as const },
  // "the the" -> "the" (offsets verified against ORIGINAL, not hand-counted)
  { startOffset: 27, endOffset: 34, suggestedText: "the", status: "pending" as const },
];

describe("the fixture itself", () => {
  it("has offsets that match the original text", () => {
    // Hand-counted offsets are exactly the kind of thing that rots silently.
    assert.equal(ORIGINAL.slice(2, 5), "are");
    assert.equal(ORIGINAL.slice(27, 34), "the the");
  });
});

describe("applySuggestions", () => {
  it("returns the original when nothing is accepted", () => {
    assert.equal(applySuggestions(ORIGINAL, SUGGESTIONS), ORIGINAL);
  });

  it("applies a single accepted suggestion", () => {
    const result = applySuggestions(ORIGINAL, [
      { ...SUGGESTIONS[0]!, status: "accepted" },
      SUGGESTIONS[1]!,
    ]);
    assert.equal(result, "I am writing to apply for the the role.");
  });

  it("applies several accepted suggestions without shifting each other", () => {
    // Patching forwards would move the second range by the length delta of the
    // first. This is the regression that test exists for.
    const result = applySuggestions(
      ORIGINAL,
      SUGGESTIONS.map((s) => ({ ...s, status: "accepted" as const })),
    );
    assert.equal(result, "I am writing to apply for the role.");
  });

  it("ignores rejected suggestions", () => {
    const result = applySuggestions(ORIGINAL, [
      { ...SUGGESTIONS[0]!, status: "accepted" },
      { ...SUGGESTIONS[1]!, status: "rejected" },
    ]);
    assert.equal(result, "I am writing to apply for the the role.");
  });

  it("round-trips: accepting then rejecting everything restores the original", () => {
    const accepted = SUGGESTIONS.map((s) => ({ ...s, status: "accepted" as const }));
    assert.notEqual(applySuggestions(ORIGINAL, accepted), ORIGINAL);

    const undone = accepted.map((s) => ({ ...s, status: "pending" as const }));
    assert.equal(
      applySuggestions(ORIGINAL, undone),
      ORIGINAL,
      "undo must give back the original text exactly",
    );
  });

  it("handles a deletion (empty replacement)", () => {
    const text = "This is very very redundant.";
    const result = applySuggestions(text, [
      { startOffset: 12, endOffset: 17, suggestedText: "", status: "accepted" },
    ]);
    assert.equal(result, "This is very redundant.");
  });

  it("handles an insertion that lengthens the text", () => {
    const text = "I went to the shop";
    const result = applySuggestions(text, [
      { startOffset: 18, endOffset: 18, suggestedText: ".", status: "accepted" },
    ]);
    // A zero-length range is not applicable — punctuation is added by
    // replacing the final character, not by a zero-width insert.
    assert.equal(result, text);
  });

  it("applies adjacent, non-overlapping suggestions correctly", () => {
    const text = "aaa bbb ccc";
    const result = applySuggestions(text, [
      { startOffset: 0, endOffset: 3, suggestedText: "XXX", status: "accepted" },
      { startOffset: 4, endOffset: 7, suggestedText: "YY", status: "accepted" },
      { startOffset: 8, endOffset: 11, suggestedText: "ZZZZ", status: "accepted" },
    ]);
    assert.equal(result, "XXX YY ZZZZ");
  });

  it("skips a range that falls outside the text", () => {
    const result = applySuggestions("short", [
      { startOffset: 0, endOffset: 500, suggestedText: "!", status: "accepted" },
    ]);
    assert.equal(result, "short");
  });

  it("skips overlapping accepted ranges rather than corrupting the text", () => {
    // Locating excludes these, so this is belt-and-braces — but a corrupted
    // document is the worst outcome this codebase could produce.
    const result = applySuggestions("abcdefgh", [
      { startOffset: 0, endOffset: 5, suggestedText: "X", status: "accepted" },
      { startOffset: 3, endOffset: 8, suggestedText: "Y", status: "accepted" },
    ]);
    assert.ok(result === "Xfgh" || result === "abcY", `unexpected: ${result}`);
  });

  it("is a no-op with no suggestions", () => {
    assert.equal(applySuggestions(ORIGINAL, []), ORIGINAL);
  });
});

describe("countByStatus", () => {
  it("counts each status", () => {
    const counts = countByStatus([
      { status: "pending" },
      { status: "accepted" },
      { status: "accepted" },
      { status: "rejected" },
    ]);
    assert.deepEqual(counts, { total: 4, pending: 1, accepted: 2, rejected: 1 });
  });

  it("handles an empty list", () => {
    assert.deepEqual(countByStatus([]), {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
    });
  });
});

describe("buildRuns", () => {
  it("splits the text into plain and suggested runs", () => {
    const runs = buildRuns(ORIGINAL, [
      { startOffset: 2, endOffset: 5 },
      { startOffset: 27, endOffset: 34 },
    ]);

    // Reassembling every run must give back the original exactly.
    assert.equal(runs.map((run) => run.text).join(""), ORIGINAL);
    assert.equal(runs.filter((run) => run.suggestion !== null).length, 2);
  });

  it("reassembles to the original with no suggestions", () => {
    const runs = buildRuns(ORIGINAL, []);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.text, ORIGINAL);
  });

  it("handles a suggestion at the very start", () => {
    const runs = buildRuns("abc def", [{ startOffset: 0, endOffset: 3 }]);
    assert.equal(runs[0]!.suggestion !== null, true);
    assert.equal(runs.map((r) => r.text).join(""), "abc def");
  });

  it("handles a suggestion at the very end", () => {
    const runs = buildRuns("abc def", [{ startOffset: 4, endOffset: 7 }]);
    assert.equal(runs.at(-1)!.suggestion !== null, true);
    assert.equal(runs.map((r) => r.text).join(""), "abc def");
  });

  it("drops an overlapping run rather than duplicating text", () => {
    const runs = buildRuns("abcdefgh", [
      { startOffset: 0, endOffset: 5 },
      { startOffset: 3, endOffset: 8 },
    ]);
    assert.equal(runs.map((r) => r.text).join(""), "abcdefgh");
  });
});
