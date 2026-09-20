import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { barHeight, niceMax } from "../src/lib/admin/scale.ts";

/**
 * An axis that is slightly wrong still looks like a chart, which is why this
 * is tested rather than eyeballed.
 */

describe("niceMax", () => {
  it("rounds up to a number a person reads as round", () => {
    assert.equal(niceMax(71), 100);
    assert.equal(niceMax(43), 50);
    assert.equal(niceMax(18), 20);
    assert.equal(niceMax(7), 10);
    assert.equal(niceMax(1), 1);
  });

  it("never returns less than the value it has to contain", () => {
    for (const value of [1, 3, 9, 17, 44, 71, 128, 999, 1001]) {
      assert.ok(
        niceMax(value) >= value,
        `${value} must fit inside ${niceMax(value)}`,
      );
    }
  });

  it("gives an empty chart a usable axis rather than zero", () => {
    assert.equal(niceMax(0), 4);
    assert.equal(niceMax(-5), 4);
    assert.equal(niceMax(Number.NaN), 4);
  });
});

describe("barHeight", () => {
  it("scales a value against the axis", () => {
    assert.equal(barHeight(50, 100), 50);
    assert.equal(barHeight(100, 100), 100);
  });

  it("gives a single run a visible sliver, not nothing", () => {
    const tiny = barHeight(1, 1000);
    assert.ok(tiny >= 2, `a non-zero day must be visible (got ${tiny})`);
  });

  it("gives a day with no runs no height at all", () => {
    // The distinction is the whole point: one run and no runs must not render
    // identically.
    assert.equal(barHeight(0, 100), 0);
  });

  it("does not divide by an absent axis", () => {
    assert.equal(barHeight(5, 0), 0);
    assert.equal(barHeight(5, Number.NaN), 0);
  });
});
