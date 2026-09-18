import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeReadability,
  countSyllables,
  describeEase,
} from "../src/lib/grammar/readability.ts";

describe("countSyllables", () => {
  it("counts common words correctly", () => {
    assert.equal(countSyllables("cat"), 1);
    assert.equal(countSyllables("running"), 2);
    assert.equal(countSyllables("beautiful"), 3);
  });

  it("handles a silent trailing e", () => {
    assert.equal(countSyllables("make"), 1);
    assert.equal(countSyllables("time"), 1);
  });

  it("keeps the syllable in a consonant + le ending", () => {
    assert.equal(countSyllables("table"), 2);
    assert.equal(countSyllables("little"), 2);
  });

  it("never returns zero for a real word", () => {
    for (const word of ["a", "I", "the", "rhythm", "queue", "strength"]) {
      assert.ok(countSyllables(word) >= 1, `${word} should have >= 1 syllable`);
    }
  });

  it("returns zero for an empty or non-alphabetic string", () => {
    assert.equal(countSyllables(""), 0);
    assert.equal(countSyllables("123"), 0);
  });
});

describe("analyzeReadability", () => {
  const simple =
    "The cat sat on the mat. It was warm. The sun was out. Birds sang in the tree.";

  const dense =
    "The epistemological ramifications of the aforementioned methodological " +
    "framework necessitate a comprehensive reconsideration of the underlying " +
    "theoretical presuppositions which have hitherto remained substantially " +
    "unexamined within the extant scholarly literature on the subject.";

  it("scores simple prose as easier than dense prose", () => {
    assert.ok(
      analyzeReadability(simple).readingEase >
        analyzeReadability(dense).readingEase,
    );
  });

  it("gives dense prose a higher grade level", () => {
    assert.ok(
      analyzeReadability(dense).gradeLevel >
        analyzeReadability(simple).gradeLevel,
    );
  });

  it("keeps reading ease within 0-100", () => {
    for (const text of [simple, dense, "Word."]) {
      const { readingEase } = analyzeReadability(text);
      assert.ok(readingEase >= 0 && readingEase <= 100, `got ${readingEase}`);
    }
  });

  it("never reports a negative grade level", () => {
    assert.ok(analyzeReadability("Go. Run. Sit.").gradeLevel >= 0);
  });

  it("counts long sentences", () => {
    const result = analyzeReadability(dense);
    assert.equal(result.sentenceCount, 1);
    assert.equal(result.longSentenceCount, 1);
    assert.equal(result.longSentenceShare, 1);
  });

  it("reports basic counts", () => {
    const result = analyzeReadability(simple);
    assert.equal(result.sentenceCount, 4);
    assert.ok(result.wordCount > 15);
    assert.ok(result.syllableCount >= result.wordCount);
  });

  it("does not divide by zero on empty input", () => {
    const result = analyzeReadability("");
    assert.equal(result.wordCount, 0);
    assert.equal(result.sentenceCount, 0);
    assert.equal(result.readingEase, 0);
    assert.equal(result.gradeLevel, 0);
    assert.equal(result.longSentenceShare, 0);
    assert.ok(Number.isFinite(result.meanSentenceLength));
  });

  it("is deterministic", () => {
    assert.deepEqual(analyzeReadability(simple), analyzeReadability(simple));
  });

  it("attaches a plain-language label", () => {
    const result = analyzeReadability(simple);
    assert.ok(result.easeLabel.length > 0);
    assert.ok(result.easeDescription.length > 10);
  });
});

describe("describeEase", () => {
  it("describes each band without scolding the writer", () => {
    for (const score of [95, 60, 40, 10]) {
      const { label, description } = describeEase(score);
      assert.ok(label.length > 0);
      assert.ok(description.length > 10);
      assert.ok(
        !/\bbad\b|\bpoor\b|\bwrong\b/i.test(`${label} ${description}`),
        `"${label}" should describe, not judge`,
      );
    }
  });

  it("notes that demanding prose is normal for specialist writing", () => {
    assert.match(describeEase(40).description, /specialist/i);
  });
});
