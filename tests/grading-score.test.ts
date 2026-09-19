import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bandFor,
  clampAwarded,
  ESTIMATED_GRADE_LABEL,
  GRADE_DISCLAIMER,
  roundPoints,
  totalFor,
} from "../src/lib/grading/score.ts";

/**
 * A grade that does not equal the sum of its parts destroys trust in the whole
 * breakdown, so the totals are computed here and never taken from a model.
 * These tests pin that, and pin the wording that stops an estimate being
 * presented as a mark.
 */

describe("clampAwarded", () => {
  it("keeps a score inside the criterion's range", () => {
    assert.equal(clampAwarded(8, 10), 8);
    assert.equal(clampAwarded(10, 10), 10);
  });

  it("clamps a score above the maximum", () => {
    // A model returning 12/10 must not reach the database, where the check
    // constraint would reject the row and lose the user's paid analysis.
    assert.equal(clampAwarded(12, 10), 10);
  });

  it("floors a negative score at zero", () => {
    assert.equal(clampAwarded(-3, 10), 0);
  });

  it("treats non-finite input as zero rather than inflating the estimate", () => {
    // Neither value carries information. Awarding the maximum would tell a
    // student their work is stronger than it is, which is the more harmful
    // direction to be wrong in for a pre-submission check.
    assert.equal(clampAwarded(Number.NaN, 10), 0);
    assert.equal(clampAwarded(Number.POSITIVE_INFINITY, 10), 0);
  });

  it("supports half and quarter marks", () => {
    assert.equal(clampAwarded(7.5, 10), 7.5);
    assert.equal(clampAwarded(7.25, 10), 7.25);
  });

  it("handles a zero-point criterion", () => {
    assert.equal(clampAwarded(5, 0), 0);
  });
});

describe("totalFor", () => {
  it("sums the criteria", () => {
    const total = totalFor([
      { awardedPoints: 8, maxPoints: 10 },
      { awardedPoints: 16, maxPoints: 20 },
      { awardedPoints: 15, maxPoints: 20 },
    ]);
    assert.equal(total.awarded, 39);
    assert.equal(total.max, 50);
    assert.equal(total.percentage, 78);
  });

  it("clamps each criterion before summing", () => {
    // Without clamping this would total 30/20 — a grade above the maximum.
    const total = totalFor([
      { awardedPoints: 15, maxPoints: 10 },
      { awardedPoints: 15, maxPoints: 10 },
    ]);
    assert.equal(total.awarded, 20);
    assert.equal(total.max, 20);
    assert.equal(total.percentage, 100);
  });

  it("never reports more than the maximum", () => {
    const total = totalFor([{ awardedPoints: 999, maxPoints: 25 }]);
    assert.ok(total.awarded <= total.max);
  });

  it("returns a null percentage for an unpointed rubric", () => {
    const total = totalFor([{ awardedPoints: 0, maxPoints: 0 }]);
    assert.equal(total.max, 0);
    assert.equal(total.percentage, null);
  });

  it("handles no criteria at all", () => {
    assert.deepEqual(totalFor([]), { awarded: 0, max: 0, percentage: null });
  });

  it("keeps fractional totals to two decimals", () => {
    const total = totalFor([
      { awardedPoints: 7.333, maxPoints: 10 },
      { awardedPoints: 2.5, maxPoints: 5 },
    ]);
    assert.equal(total.awarded, 9.83);
    assert.equal(total.max, 15);
  });
});

describe("roundPoints", () => {
  it("rounds to two decimals", () => {
    assert.equal(roundPoints(7.335), 7.34);
    assert.equal(roundPoints(7.334), 7.33);
  });

  it("treats non-finite values as zero", () => {
    assert.equal(roundPoints(Number.NaN), 0);
  });
});

describe("bandFor", () => {
  it("maps percentages to bands", () => {
    assert.equal(bandFor(92).key, "strong");
    assert.equal(bandFor(80).key, "strong");
    assert.equal(bandFor(79).key, "solid");
    assert.equal(bandFor(65).key, "solid");
    assert.equal(bandFor(64).key, "developing");
    assert.equal(bandFor(50).key, "developing");
    assert.equal(bandFor(49).key, "weak");
    assert.equal(bandFor(0).key, "weak");
  });

  it("handles an unpointed rubric", () => {
    assert.equal(bandFor(null).label, "Not scored");
  });

  it("never emits a letter grade or classification", () => {
    // Letter boundaries belong to an institution. Inventing one would dress an
    // estimate up as a registrar's decision.
    for (const percentage of [95, 72, 55, 20, null]) {
      const band = bandFor(percentage);
      const text = `${band.label} ${band.summary}`;
      assert.ok(
        !/\b(grade [A-F]|[A-F][+-]?\b\s*grade|first class|2:1|distinction|merit|pass\/fail)\b/i.test(
          text,
        ),
        `band for ${percentage} must not imply a classification: "${text}"`,
      );
    }
  });

  it("describes the work rather than the writer", () => {
    for (const percentage of [95, 40]) {
      const text = bandFor(percentage).summary.toLowerCase();
      assert.ok(
        !/\byou (are|were) (poor|weak|bad|lazy)\b|\bpoor student\b/.test(text),
        `band for ${percentage} must describe the work: "${text}"`,
      );
    }
  });
});

describe("the standing disclaimer", () => {
  it("says it is not an official grade", () => {
    assert.match(GRADE_DISCLAIMER, /not an official grade/i);
  });

  it("says it does not predict the real mark", () => {
    assert.match(GRADE_DISCLAIMER, /does not predict/i);
  });

  it("labels the number as an estimate", () => {
    assert.match(ESTIMATED_GRADE_LABEL, /estimated/i);
  });
});
