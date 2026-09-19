import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDocument } from "../src/lib/citations/parse.ts";
import { matchCitations } from "../src/lib/citations/match.ts";
import { getCitationStyle } from "../src/lib/citations/styles.ts";

const APA = getCitationStyle("apa7");

function run(text: string, style = APA) {
  return matchCitations(parseDocument(text), style);
}

const kinds = (result: ReturnType<typeof run>) =>
  result.findings.map((finding) => finding.kind);

/**
 * These are the findings WritePilot states as fact rather than opinion, so they
 * have to be exactly right in both directions — a clean document must come back
 * clean, and a missing source must never be missed.
 */

describe("matchCitations", () => {
  it("reports nothing on a document where everything lines up", () => {
    const { findings, coverage } = run(
      [
        "Sleep consolidates memory (Walker, 2007).",
        "Okonkwo and Silva (2021) replicated the effect.",
        "",
        "References",
        "",
        "Okonkwo, A., & Silva, M. (2021). Working memory. Journal, 44(2), 113-129.",
        "",
        "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
      ].join("\n"),
    );

    assert.deepEqual(findings, []);
    assert.equal(coverage.inTextCount, 2);
    assert.equal(coverage.referenceCount, 2);
    assert.equal(coverage.matchedCount, 2);
  });

  it("catches a source cited but never listed", () => {
    const { findings, coverage } = run(
      [
        "Sleep consolidates memory (Walker, 2007).",
        "",
        "References",
        "",
        "Okonkwo, A. (2021). Working memory. Journal, 44(2), 113-129.",
      ].join("\n"),
    );

    const orphan = findings.find((finding) => finding.kind === "orphan_citation");
    assert.ok(orphan);
    assert.equal(orphan.severity, "error");
    assert.ok(orphan.target.includes("Walker"));
    assert.equal(coverage.orphanCount, 1);
  });

  it("catches a listed source that is never cited", () => {
    const { findings, coverage } = run(
      [
        "Sleep consolidates memory (Walker, 2007).",
        "",
        "References",
        "",
        "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
        "",
        "Okonkwo, A. (2021). Working memory. Journal, 44(2), 113-129.",
      ].join("\n"),
    );

    const uncited = findings.find((finding) => finding.kind === "uncited_reference");
    assert.ok(uncited);
    assert.equal(uncited.severity, "warning");
    assert.ok(uncited.target.includes("Okonkwo"));
    assert.equal(coverage.uncitedCount, 1);
  });

  it("reports one orphan for a source cited several times", () => {
    const { findings } = run(
      [
        "First (Walker, 2007). Then again (Walker, 2007). And once more (Walker, 2007).",
        "",
        "References",
        "",
        "Okonkwo, A. (2021). Working memory. Journal, 44(2), 113-129.",
      ].join("\n"),
    );

    assert.equal(
      findings.filter((finding) => finding.kind === "orphan_citation").length,
      1,
    );
  });

  it("separates a disagreeing year from a missing source", () => {
    const { findings } = run(
      [
        "Sleep consolidates memory (Walker, 2008).",
        "",
        "References",
        "",
        "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
      ].join("\n"),
    );

    assert.deepEqual(kinds({ findings, coverage: null as never }), ["year_mismatch"]);
    assert.ok(findings[0]!.message.includes("2008"));
    assert.ok(findings[0]!.message.includes("2007"));
  });

  it("catches a duplicated reference entry", () => {
    const { findings } = run(
      [
        "Sleep consolidates memory (Walker, 2007).",
        "",
        "References",
        "",
        "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
        "",
        "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
      ].join("\n"),
    );

    const duplicate = findings.find((finding) => finding.kind === "duplicate_reference");
    assert.ok(duplicate);
    assert.equal(duplicate.entryPosition, 1);
  });

  it("says so when there is no reference list at all", () => {
    const { findings } = run("Sleep consolidates memory (Walker, 2007).");
    assert.ok(findings.some((finding) => finding.kind === "missing_list"));
    assert.ok(
      findings.some(
        (finding) =>
          finding.kind === "orphan_citation" &&
          finding.message.includes("no reference list"),
      ),
    );
  });

  it("flags numbered citations against an author-date style", () => {
    const { findings } = run("This has been shown repeatedly [12].");
    const mismatch = findings.find((finding) => finding.kind === "numeric_style");
    assert.ok(mismatch);
    assert.ok(mismatch.suggestion?.includes("Okonkwo"));
  });

  it("notes an uncited document rather than passing it silently", () => {
    const { findings } = run("An essay with no sources at all in it.");
    assert.deepEqual(kinds({ findings, coverage: null as never }), ["no_citations"]);
    assert.equal(findings[0]!.severity, "info");
  });

  it("matches an MLA citation that carries a page instead of a year", () => {
    const { findings, coverage } = run(
      [
        "The narrator says otherwise (Okonkwo and Silva 118).",
        "",
        "Works Cited",
        "",
        'Okonkwo, Amara, and Mateo Silva. "Working Memory under Load." Journal, vol. 44, no. 2, 2021, pp. 113-29.',
      ].join("\n"),
      getCitationStyle("mla9"),
    );

    assert.deepEqual(findings, []);
    assert.equal(coverage.matchedCount, 1);
  });

  it("counts distinct sources, not occurrences", () => {
    const { coverage } = run(
      [
        "One (Walker, 2007). Two (Walker, 2007). Three (Okonkwo, 2021).",
        "",
        "References",
        "",
        "Walker, M. (2007). Sleep and memory. Neuron, 44(1), 1-10.",
        "",
        "Okonkwo, A. (2021). Working memory. Journal, 44(2), 113-129.",
      ].join("\n"),
    );

    assert.equal(coverage.inTextCount, 3);
    assert.equal(coverage.distinctSources, 2);
  });
});
