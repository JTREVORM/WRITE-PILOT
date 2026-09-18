import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { locateSuggestions, overlaps } from "../src/lib/grammar/locate.ts";
import { splitSentenceSpans } from "../src/lib/text/segment.ts";

/**
 * This is the module that decides where a correction lands in someone's
 * document. A wrong answer here splices text into the middle of an unrelated
 * word, so every failure mode is expected to drop the suggestion rather than
 * guess.
 */

const TEXT = "I are writing to apply. The role interests me greatly.";

function raw(overrides: Partial<Parameters<typeof locateSuggestions>[1][number]> = {}) {
  return {
    sentence_index: 0,
    original_fragment: "are",
    suggested_fragment: "am",
    category: "grammar",
    severity: "correction",
    explanation: "Subject-verb agreement.",
    ...overrides,
  };
}

describe("locateSuggestions", () => {
  it("maps a quoted fragment to exact offsets in the full text", () => {
    const { located } = locateSuggestions(TEXT, [raw()]);

    assert.equal(located.length, 1);
    const [suggestion] = located;
    assert.equal(
      TEXT.slice(suggestion!.startOffset, suggestion!.endOffset),
      "are",
      "offsets must slice back to the quoted fragment",
    );
  });

  it("scopes the search to the reported sentence", () => {
    // "role" appears only in sentence 1. Reported against sentence 0, it must
    // not be found by searching the whole document.
    const { located, dropped } = locateSuggestions(TEXT, [
      raw({ sentence_index: 0, original_fragment: "role", suggested_fragment: "position" }),
    ]);

    assert.equal(located.length, 0);
    assert.equal(dropped[0]!.reason, "fragment_not_found");
  });

  it("locates a fragment in a later sentence at the right document offset", () => {
    const { located } = locateSuggestions(TEXT, [
      raw({
        sentence_index: 1,
        original_fragment: "greatly",
        suggested_fragment: "",
        category: "wordiness",
      }),
    ]);

    assert.equal(located.length, 1);
    assert.equal(
      TEXT.slice(located[0]!.startOffset, located[0]!.endOffset),
      "greatly",
    );
  });

  it("drops a fragment that appears twice in the same sentence", () => {
    // "the the" is exactly this case: correcting the wrong occurrence would
    // look like a bug.
    const text = "The the report is the best.";
    const { located, dropped } = locateSuggestions(text, [
      raw({ sentence_index: 0, original_fragment: "the", suggested_fragment: "" }),
    ]);

    assert.equal(located.length, 0);
    assert.equal(dropped[0]!.reason, "ambiguous_fragment");
  });

  it("drops an out-of-range sentence index", () => {
    const { located, dropped } = locateSuggestions(TEXT, [
      raw({ sentence_index: 99 }),
    ]);
    assert.equal(located.length, 0);
    assert.equal(dropped[0]!.reason, "index_out_of_range");
  });

  it("drops a non-integer index", () => {
    const { dropped } = locateSuggestions(TEXT, [raw({ sentence_index: 1.5 })]);
    assert.equal(dropped[0]!.reason, "invalid_index");
  });

  it("drops an empty fragment", () => {
    const { dropped } = locateSuggestions(TEXT, [raw({ original_fragment: "" })]);
    assert.equal(dropped[0]!.reason, "empty_fragment");
  });

  it("drops an unknown category rather than storing it", () => {
    // The column is an enum; an unknown value would fail the insert.
    const { dropped } = locateSuggestions(TEXT, [raw({ category: "vibes" })]);
    assert.equal(dropped[0]!.reason, "unknown_category");
  });

  it("drops a suggestion that changes nothing", () => {
    const { dropped } = locateSuggestions(TEXT, [
      raw({ suggested_fragment: "are" }),
    ]);
    assert.equal(dropped[0]!.reason, "no_change");
  });

  it("falls back to a safe severity rather than dropping", () => {
    const { located } = locateSuggestions(TEXT, [raw({ severity: "urgent" })]);
    assert.equal(located[0]!.severity, "improvement");
  });

  it("keeps an empty replacement, which means deletion", () => {
    const { located } = locateSuggestions(TEXT, [
      raw({
        sentence_index: 1,
        original_fragment: " greatly",
        suggested_fragment: "",
        category: "wordiness",
      }),
    ]);
    assert.equal(located.length, 1);
    assert.equal(located[0]!.suggestedText, "");
  });

  it("drops the second of two overlapping suggestions", () => {
    const text = "This is very very redundant.";
    const { located, dropped } = locateSuggestions(text, [
      raw({ original_fragment: "very very", suggested_fragment: "very", category: "repetition" }),
      raw({ original_fragment: "very redundant", suggested_fragment: "redundant", category: "wordiness" }),
    ]);

    assert.equal(located.length, 1, "only one of an overlapping pair survives");
    assert.equal(dropped.at(-1)!.reason, "overlapping");
  });

  it("orders suggestions by position and numbers them from zero", () => {
    const { located } = locateSuggestions(TEXT, [
      raw({ sentence_index: 1, original_fragment: "greatly", suggested_fragment: "", category: "wordiness" }),
      raw({ sentence_index: 0, original_fragment: "are", suggested_fragment: "am" }),
    ]);

    assert.equal(located.length, 2);
    assert.equal(located[0]!.originalText, "are", "document order, not input order");
    assert.equal(located[0]!.position, 0);
    assert.equal(located[1]!.position, 1);
    assert.ok(located[0]!.startOffset < located[1]!.startOffset);
  });

  it("accepts pre-computed sentence spans", () => {
    const spans = splitSentenceSpans(TEXT);
    const { located } = locateSuggestions(TEXT, [raw()], spans);
    assert.equal(located.length, 1);
  });

  it("returns nothing for no input", () => {
    const { located, dropped } = locateSuggestions(TEXT, []);
    assert.equal(located.length, 0);
    assert.equal(dropped.length, 0);
  });
});

describe("overlaps", () => {
  it("detects genuine overlap", () => {
    assert.equal(
      overlaps({ startOffset: 0, endOffset: 5 }, { startOffset: 3, endOffset: 8 }),
      true,
    );
  });

  it("treats touching ranges as disjoint", () => {
    // [0,5) and [5,8) share no character, so both can be applied.
    assert.equal(
      overlaps({ startOffset: 0, endOffset: 5 }, { startOffset: 5, endOffset: 8 }),
      false,
    );
  });

  it("detects containment", () => {
    assert.equal(
      overlaps({ startOffset: 0, endOffset: 10 }, { startOffset: 2, endOffset: 4 }),
      true,
    );
  });
});
