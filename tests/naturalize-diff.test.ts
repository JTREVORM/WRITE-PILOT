import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  diffStats,
  diffWords,
  reconstruct,
  tokenize,
} from "../src/lib/naturalize/diff.ts";

/**
 * The property that matters: the diff must be lossless. Reassembling the
 * "original" side has to give back exactly what the writer submitted, and the
 * "improved" side exactly what the rewrite produced. If that ever fails, the
 * comparison is showing the user something that was never in either text.
 */

function assertRoundTrip(original: string, improved: string) {
  const runs = diffWords(original, improved);
  assert.equal(
    reconstruct(runs, "original"),
    original,
    "original side must reassemble exactly",
  );
  assert.equal(
    reconstruct(runs, "improved"),
    improved,
    "improved side must reassemble exactly",
  );
}

describe("tokenize", () => {
  it("joins back to the exact input, whatever the whitespace", () => {
    // This is the guarantee the entire comparison rests on.
    for (const text of [
      "The  quick\nbrown fox.",
      "  leading spaces",
      "trailing  ",
      "  both  ",
      "single",
      "   \n ",
      "",
    ]) {
      assert.equal(tokenize(text).join(""), text, JSON.stringify(text));
    }
  });

  it("returns nothing for an empty string", () => {
    assert.deepEqual(tokenize(""), []);
  });
});

describe("diffWords", () => {
  it("reports an unchanged passage as a single equal run", () => {
    const runs = diffWords("No change here.", "No change here.");
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.kind, "equal");
  });

  it("identifies a replaced word", () => {
    const runs = diffWords("The results were good.", "The results were compelling.");
    assert.ok(runs.some((r) => r.kind === "removed" && r.text.includes("good")));
    assert.ok(runs.some((r) => r.kind === "added" && r.text.includes("compelling")));
    assert.ok(runs.some((r) => r.kind === "equal" && r.text.includes("results")));
  });

  it("identifies a deletion", () => {
    const runs = diffWords("In order to begin", "To begin");
    assert.ok(runs.some((r) => r.kind === "removed"));
    assertRoundTrip("In order to begin", "To begin");
  });

  it("identifies an insertion", () => {
    assertRoundTrip("The study shows", "The recent study clearly shows");
  });

  it("treats a case-only change as equal", () => {
    // Recasing a word is not an edit worth drawing the reader's eye to.
    const runs = diffWords("the study", "The study");
    assert.ok(runs.every((r) => r.kind === "equal"));
    // ...but the improved side must still reproduce the new casing.
    assert.equal(reconstruct(runs, "improved"), "The study");
  });

  it("merges adjacent runs of the same kind into phrases", () => {
    const runs = diffWords(
      "It is very very redundant indeed.",
      "It is redundant.",
    );
    // Consecutive removals read as one phrase, not a stutter of single words.
    const removals = runs.filter((r) => r.kind === "removed");
    assert.ok(removals.length <= 2, `expected merged removals, got ${removals.length}`);
  });

  it("round-trips a full paragraph rewrite", () => {
    const original =
      "In order to demonstrate my suitability for the position, I have " +
      "attached a copy of my curriculum vitae for your consideration.";
    const improved =
      "To show I am suited to the position, I have attached my CV.";
    assertRoundTrip(original, improved);
  });

  it("round-trips when the original is empty", () => {
    assertRoundTrip("", "Newly written sentence.");
  });

  it("round-trips when the rewrite is empty", () => {
    assertRoundTrip("Removed entirely.", "");
  });

  it("handles both empty", () => {
    assert.deepEqual(diffWords("", ""), []);
  });

  it("preserves multi-line structure", () => {
    assertRoundTrip("Line one.\nLine two.", "Line one changed.\nLine two.");
  });

  it("falls back without allocating a huge table for very long passages", () => {
    // Guards the O(n*m) table. The fallback still round-trips.
    const long = "word ".repeat(5000);
    const other = "term ".repeat(5000);
    const runs = diffWords(long, other);
    assert.equal(reconstruct(runs, "original"), long);
    assert.equal(reconstruct(runs, "improved"), other);
  });

  it("round-trips across a range of realistic edits", () => {
    const cases: Array<[string, string]> = [
      ["A B C D E", "A C E"],
      ["A C E", "A B C D E"],
      ["one two three", "three two one"],
      ["Hello, world!", "Hello world."],
      ["  leading spaces", "leading spaces"],
      ["trailing  ", "trailing"],
      ["Dr. Smith et al. found this.", "Smith and colleagues found this."],
    ];
    for (const [a, b] of cases) assertRoundTrip(a, b);
  });
});

describe("diffStats", () => {
  it("counts kept, removed and added tokens", () => {
    const stats = diffStats(diffWords("a b c", "a x c"));
    assert.equal(stats.kept, 2);
    assert.equal(stats.removed, 1);
    assert.equal(stats.added, 1);
  });

  it("reports full retention for an unchanged passage", () => {
    assert.equal(diffStats(diffWords("same text", "same text")).retention, 1);
  });

  it("reports low retention for a wholesale rewrite", () => {
    const stats = diffStats(diffWords("alpha beta gamma", "one two three"));
    assert.equal(stats.retention, 0);
  });

  it("does not divide by zero on an empty diff", () => {
    assert.equal(diffStats([]).retention, 1);
  });
});
