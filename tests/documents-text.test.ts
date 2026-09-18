import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveTitle,
  normalizeExtractedText,
} from "../src/lib/documents/text.ts";

describe("normalizeExtractedText", () => {
  it("normalises line endings", () => {
    assert.equal(normalizeExtractedText("a\r\nb"), "a\nb");
    assert.equal(normalizeExtractedText("a\rb"), "a\nb");
  });

  it("preserves paragraph breaks", () => {
    // Paragraph breaks are the unit the whole result view is built on.
    assert.equal(normalizeExtractedText("One.\n\nTwo."), "One.\n\nTwo.");
  });

  it("collapses runs of blank lines to a single break", () => {
    assert.equal(normalizeExtractedText("One.\n\n\n\n\nTwo."), "One.\n\nTwo.");
  });

  it("rejoins words hyphenated across a line break", () => {
    // PDF text layers routinely split words at the line edge.
    assert.equal(
      normalizeExtractedText("method-\nology is sound"),
      "methodology is sound",
    );
  });

  it("strips zero-width and soft-hyphen characters", () => {
    assert.equal(normalizeExtractedText("in­ter​nal"), "internal");
  });

  it("collapses runs of spaces and trailing whitespace", () => {
    assert.equal(normalizeExtractedText("a    b   \nc"), "a b\nc");
  });

  it("trims the document", () => {
    assert.equal(normalizeExtractedText("\n\n  text  \n\n"), "text");
  });
});

describe("deriveTitle", () => {
  it("prefers the filename without its extension", () => {
    assert.equal(
      deriveTitle({ filename: "Chapter 3 draft.docx", text: "Anything" }),
      "Chapter 3 draft",
    );
  });

  it("falls back to the first non-empty line", () => {
    assert.equal(
      deriveTitle({ filename: null, text: "\n\nIntroduction\n\nBody text" }),
      "Introduction",
    );
  });

  it("truncates a long first line with an ellipsis", () => {
    const title = deriveTitle({ filename: null, text: "x".repeat(200) });
    assert.ok(title.length <= 81);
    assert.ok(title.endsWith("…"));
  });

  it("does not add an ellipsis when nothing was cut", () => {
    assert.equal(deriveTitle({ filename: null, text: "Short title" }), "Short title");
  });

  it("has a fallback for empty input", () => {
    assert.equal(deriveTitle({ filename: null, text: "   " }), "Untitled scan");
  });
});
