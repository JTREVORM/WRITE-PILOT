import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bandFor,
  clampLikelihood,
  confidenceFor,
  CONFIDENCE_COPY,
  MIN_WORDS_FOR_DETECTION,
} from "../src/lib/detection/scoring.ts";

/**
 * How a detection result is worded is a product decision with real
 * consequences — this output can end up in front of someone deciding whether a
 * student cheated. These tests pin the framing so it cannot drift into claiming
 * certainty the measurement does not support.
 */
describe("bandFor", () => {
  it("places each score in the expected band", () => {
    assert.equal(bandFor(0).key, "low");
    assert.equal(bandFor(24).key, "low");
    assert.equal(bandFor(25).key, "moderate");
    assert.equal(bandFor(49).key, "moderate");
    assert.equal(bandFor(50).key, "elevated");
    assert.equal(bandFor(74).key, "elevated");
    assert.equal(bandFor(75).key, "high");
    assert.equal(bandFor(100).key, "high");
  });

  it("never states a verdict on authorship", () => {
    for (const score of [0, 30, 60, 95, 100]) {
      const band = bandFor(score);
      const text = `${band.label} ${band.summary}`.toLowerCase();

      assert.ok(
        !/\bis ai[- ]generated\b|\bwas written by ai\b|\bplagiari/.test(text),
        `band ${band.key} must not assert authorship: "${text}"`,
      );
      assert.ok(
        !/\bproof\b|\bproven\b|\bconfirmed\b|\bdefinitely\b/.test(text),
        `band ${band.key} must not claim certainty: "${text}"`,
      );
    }
  });

  it("hedges even at the top of the range", () => {
    const top = bandFor(100).summary.toLowerCase();
    assert.ok(
      top.includes("estimate"),
      "the strongest band must still name itself an estimate",
    );
  });

  it("labels the top band as indicators rather than a finding", () => {
    assert.equal(bandFor(90).label, "Strong AI indicators");
  });

  it("survives out-of-range and non-finite input", () => {
    assert.equal(bandFor(-20).key, "low");
    assert.equal(bandFor(250).key, "high");
    assert.equal(bandFor(Number.NaN).key, "low");
  });
});

describe("clampLikelihood", () => {
  it("bounds and rounds to a whole percentage", () => {
    assert.equal(clampLikelihood(42.4), 42);
    assert.equal(clampLikelihood(42.6), 43);
    assert.equal(clampLikelihood(-5), 0);
    assert.equal(clampLikelihood(180), 100);
  });

  it("treats non-finite values as zero rather than propagating NaN", () => {
    // A NaN here would reach a NOT NULL integer column and fail the insert.
    assert.equal(clampLikelihood(Number.NaN), 0);
    assert.equal(clampLikelihood(Number.POSITIVE_INFINITY), 0);
  });
});

describe("confidenceFor", () => {
  it("is low for short passages", () => {
    assert.equal(confidenceFor({ wordCount: 60, paragraphCount: 1 }), "low");
    assert.equal(confidenceFor({ wordCount: 149, paragraphCount: 4 }), "low");
  });

  it("is low for a single paragraph however long", () => {
    // One paragraph gives no paragraph-to-paragraph variation to measure.
    assert.equal(confidenceFor({ wordCount: 5000, paragraphCount: 1 }), "low");
  });

  it("rises with the amount of text", () => {
    assert.equal(confidenceFor({ wordCount: 300, paragraphCount: 3 }), "medium");
    assert.equal(confidenceFor({ wordCount: 900, paragraphCount: 6 }), "high");
  });

  it("has copy for every level that admits the estimate is an estimate", () => {
    for (const level of ["low", "medium", "high"] as const) {
      const copy = CONFIDENCE_COPY[level];
      assert.ok(copy.label.length > 0);
      assert.ok(copy.explanation.length > 20);
    }
    assert.ok(
      CONFIDENCE_COPY.high.explanation.toLowerCase().includes("estimate"),
      "even the highest confidence must not imply certainty",
    );
  });
});

describe("minimum input", () => {
  it("requires enough text to say anything useful", () => {
    assert.ok(MIN_WORDS_FOR_DETECTION >= 50);
  });
});
