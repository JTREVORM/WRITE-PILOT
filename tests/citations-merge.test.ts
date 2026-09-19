import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFindingRows } from "../src/lib/citations/merge.ts";
import type { LocalFinding } from "../src/lib/citations/match.ts";
import type { CitationReview } from "../src/lib/citations/prompt.ts";

const orphan: LocalFinding = {
  kind: "orphan_citation",
  severity: "error",
  target: "(Walker, 2007)",
  message: "Cited but not listed.",
  suggestion: "Add it.",
  entryPosition: null,
};

function review(findings: CitationReview["findings"]): CitationReview {
  return { detected_style: "apa7", summary: "", findings };
}

/**
 * Half of this report is arithmetic and half is a model's reading. The merge is
 * where that distinction could quietly be lost.
 */

describe("buildFindingRows", () => {
  it("keeps the local findings ahead of the model's", () => {
    const rows = buildFindingRows({
      localFindings: [orphan],
      review: review([
        {
          entry_index: 0,
          target: "Okonkwo, A. (2021). X.",
          severity: "error",
          message: "The journal title is missing.",
          suggestion: "",
        },
      ]),
      entryCount: 1,
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.origin, "local");
    assert.equal(rows[1]!.origin, "model");
  });

  it("labels every model finding as assessed rather than counted", () => {
    const rows = buildFindingRows({
      localFindings: [],
      review: review([
        { entry_index: 0, target: "X", severity: "warning", message: "Y", suggestion: "" },
      ]),
      entryCount: 1,
    });

    assert.equal(rows[0]!.origin, "model");
    assert.equal(rows[0]!.kind, "format");
  });

  it("drops a model finding that repeats a local one about the same source", () => {
    const rows = buildFindingRows({
      localFindings: [orphan],
      review: review([
        {
          entry_index: -1,
          target: "(Walker, 2007)",
          severity: "warning",
          message: "This may be missing from the reference list.",
          suggestion: "",
        },
      ]),
      entryCount: 0,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.origin, "local");
  });

  it("keeps two different problems with the same entry", () => {
    const rows = buildFindingRows({
      localFindings: [],
      review: review([
        { entry_index: 0, target: "Entry", severity: "error", message: "No year.", suggestion: "" },
        { entry_index: 0, target: "Entry", severity: "error", message: "No page range.", suggestion: "" },
        { entry_index: 0, target: "Entry", severity: "error", message: "No year.", suggestion: "" },
      ]),
      entryCount: 1,
    });

    assert.equal(rows.length, 2);
  });

  it("unlinks a finding that points at an entry it was never given", () => {
    const rows = buildFindingRows({
      localFindings: [],
      review: review([
        { entry_index: 9, target: "Invented", severity: "info", message: "Something.", suggestion: "" },
      ]),
      entryCount: 2,
    });

    assert.equal(rows[0]!.entryPosition, null);
  });

  it("drops a finding with no message at all", () => {
    const rows = buildFindingRows({
      localFindings: [],
      review: review([
        { entry_index: 0, target: "Entry", severity: "info", message: "   ", suggestion: "" },
      ]),
      entryCount: 1,
    });

    assert.deepEqual(rows, []);
  });

  it("orders each half with the errors first", () => {
    const rows = buildFindingRows({
      localFindings: [],
      review: review([
        { entry_index: 0, target: "A", severity: "info", message: "Note.", suggestion: "" },
        { entry_index: 1, target: "B", severity: "error", message: "Broken.", suggestion: "" },
        { entry_index: 2, target: "C", severity: "warning", message: "Odd.", suggestion: "" },
      ]),
      entryCount: 3,
    });

    assert.deepEqual(
      rows.map((row) => row.severity),
      ["error", "warning", "info"],
    );
  });
});
