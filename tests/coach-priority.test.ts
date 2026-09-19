import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bandFor,
  clampRating,
  isImprovementCategory,
  orderActions,
  priorityScore,
} from "../src/lib/coach/priority.ts";

/**
 * The ordering is the feature. A list of thirty fixes in the order a model
 * noticed them helps nobody; what to spend the evening on does.
 */

describe("clampRating", () => {
  it("keeps a rating inside 1-5", () => {
    assert.equal(clampRating(0), 1);
    assert.equal(clampRating(-4), 1);
    assert.equal(clampRating(9), 5);
    assert.equal(clampRating(3), 3);
  });

  it("rounds a fractional rating", () => {
    assert.equal(clampRating(3.4), 3);
    assert.equal(clampRating(3.6), 4);
  });

  it("falls back to the middle for a rating that is not a number", () => {
    assert.equal(clampRating(Number.NaN), 3);
    assert.equal(clampRating(Number.POSITIVE_INFINITY), 3);
  });
});

describe("priorityScore", () => {
  it("lets impact dominate effort", () => {
    const bigAndSlow = priorityScore({ impact: 5, effort: 5 });
    const smallAndFast = priorityScore({ impact: 2, effort: 1 });

    assert.ok(
      bigAndSlow > smallAndFast,
      `a large improvement should outrank a quick trivial one (${bigAndSlow} vs ${smallAndFast})`,
    );
  });

  it("breaks a tie on impact by effort", () => {
    assert.ok(
      priorityScore({ impact: 4, effort: 1 }) >
        priorityScore({ impact: 4, effort: 5 }),
    );
  });

  it("clamps before scoring, so a wild rating cannot distort the order", () => {
    assert.equal(
      priorityScore({ impact: 99, effort: 0 }),
      priorityScore({ impact: 5, effort: 1 }),
    );
  });
});

describe("bandFor", () => {
  it("puts a high-impact, low-effort change first", () => {
    assert.equal(bandFor(priorityScore({ impact: 5, effort: 2 })).key, "first");
  });

  it("calls a moderate change worthwhile", () => {
    assert.equal(
      bandFor(priorityScore({ impact: 3, effort: 3 })).key,
      "worthwhile",
    );
  });

  it("puts a small or expensive change last", () => {
    assert.equal(
      bandFor(priorityScore({ impact: 1, effort: 5 })).key,
      "optional",
    );
  });

  it("always ships a written label, never a bare score", () => {
    for (const score of [7, 20, 32, 35]) {
      assert.ok(bandFor(score).label.length > 0);
      assert.ok(bandFor(score).summary.length > 0);
    }
  });
});

describe("orderActions", () => {
  it("orders by score, highest first", () => {
    const ordered = orderActions([
      { id: "c", impact: 2, effort: 2 },
      { id: "a", impact: 5, effort: 1 },
      { id: "b", impact: 4, effort: 4 },
    ]);

    assert.deepEqual(
      ordered.map((action) => action.id),
      ["a", "b", "c"],
    );
  });

  it("prefers a measured finding over an equally weighted opinion", () => {
    const ordered = orderActions([
      { id: "advised", impact: 4, effort: 2, measured: false },
      { id: "measured", impact: 4, effort: 2, measured: true },
    ]);

    assert.equal(ordered[0]!.id, "measured");
  });

  it("is stable for genuinely equal items", () => {
    const ordered = orderActions([
      { id: "first", impact: 3, effort: 3 },
      { id: "second", impact: 3, effort: 3 },
      { id: "third", impact: 3, effort: 3 },
    ]);

    assert.deepEqual(
      ordered.map((action) => action.id),
      ["first", "second", "third"],
    );
  });

  it("does not modify the array it was given", () => {
    const input = [
      { id: "low", impact: 1, effort: 1 },
      { id: "high", impact: 5, effort: 1 },
    ];
    orderActions(input);

    assert.equal(input[0]!.id, "low");
  });
});

describe("isImprovementCategory", () => {
  it("accepts the categories the schema stores", () => {
    for (const category of ["structure", "argument", "citations"]) {
      assert.equal(isImprovementCategory(category), true);
    }
  });

  it("rejects anything else", () => {
    assert.equal(isImprovementCategory("vibes"), false);
    assert.equal(isImprovementCategory(null), false);
    assert.equal(isImprovementCategory(3), false);
  });
});
