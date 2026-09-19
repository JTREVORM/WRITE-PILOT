import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeRubric } from "../src/lib/grading/rubric.ts";

/**
 * Rubrics arrive as prose, tables, bullet lists and scanned handouts. These are
 * the messy cases, tested here rather than discovered against someone's real
 * coursework brief.
 */

describe("normalizeRubric", () => {
  it("normalises a clean rubric", () => {
    const result = normalizeRubric([
      { name: "Introduction", max_points: 10 },
      { name: "Argument", max_points: 20 },
      { name: "Evidence", max_points: 20 },
    ]);

    assert.equal(result.criteria.length, 3);
    assert.equal(result.totalPoints, 50);
    assert.deepEqual(
      result.criteria.map((c) => c.position),
      [0, 1, 2],
    );
  });

  it("strips points that were carried into the criterion name", () => {
    // Rubric tables routinely produce "Introduction — 10 points" as the name.
    for (const name of [
      "Introduction — 10 points",
      "Introduction (10 points)",
      "Introduction - 10 pts",
      "Introduction 10 marks",
      "Introduction:",
    ]) {
      const result = normalizeRubric([{ name, max_points: 10 }]);
      assert.equal(result.criteria[0]!.name, "Introduction", name);
    }
  });

  it("collapses whitespace in names", () => {
    const result = normalizeRubric([
      { name: "  Critical   thinking\n ", max_points: 20 },
    ]);
    assert.equal(result.criteria[0]!.name, "Critical thinking");
  });

  it("drops a criterion with no name", () => {
    const result = normalizeRubric([
      { name: "   ", max_points: 10 },
      { name: "Valid", max_points: 5 },
    ]);
    assert.equal(result.criteria.length, 1);
    assert.equal(result.dropped[0]!.reason, "empty_name");
  });

  it("drops invalid point values", () => {
    const result = normalizeRubric([
      { name: "Bad", max_points: Number.NaN },
      { name: "Negative", max_points: -5 },
      { name: "Good", max_points: 10 },
    ]);
    assert.equal(result.criteria.length, 1);
    assert.equal(result.totalPoints, 10);
  });

  it("rejects an absurd point value rather than distorting the total", () => {
    const result = normalizeRubric([
      { name: "Misparsed", max_points: 100000 },
      { name: "Real", max_points: 10 },
    ]);
    assert.equal(result.criteria.length, 1);
    assert.equal(result.totalPoints, 10);
    assert.equal(result.dropped[0]!.reason, "points_out_of_range");
  });

  it("merges a duplicated criterion, keeping the larger allocation", () => {
    // Halving the weighting would silently change what the rubric is worth.
    const result = normalizeRubric([
      { name: "Evidence", max_points: 10 },
      { name: "evidence", max_points: 20 },
    ]);
    assert.equal(result.criteria.length, 1);
    assert.equal(result.criteria[0]!.maxPoints, 20);
    assert.equal(result.totalPoints, 20);
  });

  it("fills a missing description from a merged duplicate", () => {
    const result = normalizeRubric([
      { name: "Evidence", max_points: 20, description: null },
      { name: "Evidence", max_points: 10, description: "Cites sources." },
    ]);
    assert.equal(result.criteria[0]!.description, "Cites sources.");
  });

  it("renumbers positions after merging", () => {
    const result = normalizeRubric([
      { name: "A", max_points: 5 },
      { name: "A", max_points: 5 },
      { name: "B", max_points: 5 },
    ]);
    assert.deepEqual(
      result.criteria.map((c) => c.position),
      [0, 1],
    );
  });

  it("caps the number of criteria", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `Criterion ${i}`,
      max_points: 1,
    }));
    const result = normalizeRubric(many);
    assert.ok(result.criteria.length <= 40);
    assert.ok(result.dropped.some((d) => d.reason === "too_many"));
  });

  it("accepts a zero-point criterion", () => {
    // Some rubrics list ungraded requirements alongside graded ones.
    const result = normalizeRubric([{ name: "Formatting", max_points: 0 }]);
    assert.equal(result.criteria.length, 1);
    assert.equal(result.totalPoints, 0);
  });

  it("handles fractional points", () => {
    const result = normalizeRubric([
      { name: "A", max_points: 7.5 },
      { name: "B", max_points: 2.5 },
    ]);
    assert.equal(result.totalPoints, 10);
  });

  it("returns an empty rubric for empty input", () => {
    const result = normalizeRubric([]);
    assert.deepEqual(result.criteria, []);
    assert.equal(result.totalPoints, 0);
  });
});
