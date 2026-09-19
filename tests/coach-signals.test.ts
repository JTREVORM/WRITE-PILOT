import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { carryPriorSignals } from "../src/lib/coach/signals.ts";
import { orderActions } from "../src/lib/coach/priority.ts";

/**
 * Carrying prior results forward is what makes a review cheaper and more
 * honest than re-reading the document from scratch. What is *not* carried
 * matters just as much.
 */

describe("carryPriorSignals", () => {
  it("carries nothing when nothing has been run", () => {
    assert.deepEqual(carryPriorSignals({}), []);
  });

  it("turns missing references into the thing to do about them", () => {
    const actions = carryPriorSignals({
      citations: { orphans: 3, uncited: 0, style: "APA 7" },
    });

    assert.equal(actions.length, 1);
    assert.match(actions[0]!.title, /Add reference entries for 3 cited sources/);
    assert.equal(actions[0]!.category, "citations");
    assert.equal(actions[0]!.measured, true);
    assert.equal(actions[0]!.origin, "citations");
  });

  it("reads singular and plural correctly", () => {
    const one = carryPriorSignals({
      citations: { orphans: 1, uncited: 1, style: "MLA 9" },
    });

    assert.match(one[0]!.title, /1 cited source$/);
    assert.match(one[1]!.title, /1 unused entry$/);
    assert.match(one[1]!.detail, /entry is/);
  });

  it("names the weakest rubric criterion", () => {
    const actions = carryPriorSignals({
      grade: {
        percentage: 58,
        weakCriteria: [
          { name: "Argument and analysis", awarded: 8, max: 20 },
          { name: "Use of evidence", awarded: 9, max: 20 },
        ],
      },
    });

    assert.match(actions[0]!.title, /Argument and analysis/);
    assert.match(actions[0]!.detail, /8 of 20/);
    assert.match(actions[0]!.detail, /weakest of 2 criteria/);
  });

  it("separates meaning-changing grammar suggestions from polish", () => {
    const significant = carryPriorSignals({
      grammar: { openSuggestions: 12, significant: 3 },
    });
    const polish = carryPriorSignals({
      grammar: { openSuggestions: 12, significant: 0 },
    });

    assert.match(significant[0]!.title, /3 significant/);
    assert.match(polish[0]!.title, /12 open/);
    assert.ok(
      significant[0]!.impact > polish[0]!.impact,
      "a meaning-changing suggestion should outrank polish",
    );
  });

  it("puts a dropped citation above a grammar tidy-up", () => {
    const ordered = orderActions(
      carryPriorSignals({
        grammar: { openSuggestions: 12, significant: 0 },
        naturalize: { integrityFindings: 2 },
      }),
    );

    assert.equal(ordered[0]!.origin, "naturalize");
  });

  it("never turns a detection likelihood into something to do", () => {
    // There is no detection field to pass, by design: coaching a user toward a
    // lower AI-likelihood score is the product WritePilot refuses to be.
    const signals = { detection: { likelihood: 91 } } as Record<string, unknown>;
    const actions = carryPriorSignals(signals);

    assert.deepEqual(actions, []);
    assert.ok(
      !JSON.stringify(actions).toLowerCase().includes("detect"),
      "detection must not reach the improvement list",
    );
  });
});
