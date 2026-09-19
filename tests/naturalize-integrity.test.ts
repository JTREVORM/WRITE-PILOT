import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkIntegrity } from "../src/lib/naturalize/integrity.ts";

/**
 * The one way this tool could genuinely damage someone's work is by losing a
 * figure or a citation while improving the prose. These tests pin that.
 */

describe("checkIntegrity", () => {
  it("reports nothing when the rewrite keeps everything", () => {
    const original = "The sample of 240 students (Smith, 2019) improved by 12%.";
    const improved = "Among 240 students (Smith, 2019), performance rose 12%.";
    assert.deepEqual(checkIntegrity(original, improved), []);
  });

  it("catches a dropped figure", () => {
    const findings = checkIntegrity(
      "Participation rose by 47% over the period.",
      "Participation rose noticeably over the period.",
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.kind, "number");
    assert.ok(findings[0]!.value.includes("47"));
  });

  it("catches a dropped parenthetical citation", () => {
    const findings = checkIntegrity(
      "Memory consolidates during sleep (Walker et al., 2007).",
      "Memory consolidates while we sleep.",
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.kind, "citation");
  });

  it("catches a dropped narrative citation", () => {
    const findings = checkIntegrity(
      "Walker (2007) showed the effect clearly.",
      "The effect has been shown clearly.",
    );
    assert.ok(findings.some((f) => f.kind === "citation"));
  });

  it("catches an altered quotation", () => {
    const findings = checkIntegrity(
      'She called it "a fundamental reordering of priorities" in her address.',
      'She called it a complete reordering of priorities in her address.',
    );
    assert.ok(findings.some((f) => f.kind === "quotation"));
  });

  it("catches a dropped DOI", () => {
    const findings = checkIntegrity(
      "See 10.1038/nature12373 for the full data.",
      "The full data is available online.",
    );
    assert.ok(findings.some((f) => f.kind === "link"));
  });

  it("catches a dropped URL", () => {
    const findings = checkIntegrity(
      "Details at https://example.org/study for reference.",
      "Details are available for reference.",
    );
    assert.ok(findings.some((f) => f.kind === "link"));
  });

  it("ignores punctuation and spacing differences around a citation", () => {
    // "(Smith, 2019)" vs "(Smith 2019)" is a formatting change, not a loss.
    const findings = checkIntegrity(
      "As shown (Smith, 2019).",
      "As shown (Smith 2019).",
    );
    assert.equal(findings.length, 0);
  });

  it("does not report the same missing item twice", () => {
    const findings = checkIntegrity(
      "It rose 40% and then fell 40% again.",
      "It rose and then fell again.",
    );
    assert.equal(findings.filter((f) => f.kind === "number").length, 1);
  });

  it("flags a wholesale rewrite as a scope finding", () => {
    const findings = checkIntegrity("alpha beta gamma", "one two three", {
      retention: 0.1,
      mode: "natural",
    });
    assert.ok(findings.some((f) => f.kind === "scope"));
  });

  it("does not flag heavy cutting when the mode is meant to cut", () => {
    for (const mode of ["concise", "simple"]) {
      const findings = checkIntegrity("alpha beta gamma", "alpha", {
        retention: 0.1,
        mode,
      });
      assert.equal(
        findings.filter((f) => f.kind === "scope").length,
        0,
        `${mode} should not be flagged for cutting`,
      );
    }
  });

  it("does not flag a normal polish", () => {
    const findings = checkIntegrity(
      "In order to demonstrate this, we ran the study.",
      "To demonstrate this, we ran the study.",
      { retention: 0.85, mode: "natural" },
    );
    assert.deepEqual(findings, []);
  });

  it("gives every finding an actionable message", () => {
    const findings = checkIntegrity(
      'The 42 cases (Jones, 2020) showed "a marked shift in outcomes overall".',
      "The cases showed a shift.",
      { retention: 0.2, mode: "natural" },
    );
    assert.ok(findings.length >= 3);
    for (const finding of findings) {
      assert.ok(finding.message.length > 20, finding.kind);
      assert.ok(finding.value.length > 0, finding.kind);
    }
  });

  it("is deterministic and safe on empty input", () => {
    assert.deepEqual(checkIntegrity("", ""), []);
    assert.deepEqual(checkIntegrity("Some text.", "Some text."), []);
  });
});
