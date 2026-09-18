import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countWords,
  formatCurrency,
  initialsFrom,
  pluralize,
} from "../src/lib/utils/format.ts";

describe("formatCurrency", () => {
  it("renders whole amounts without trailing zeros", () => {
    assert.equal(formatCurrency(0, "USD", "en-US"), "$0");
  });

  it("renders minor units correctly", () => {
    assert.equal(formatCurrency(599, "USD", "en-US"), "$5.99");
    assert.equal(formatCurrency(1999, "USD", "en-US"), "$19.99");
  });

  it("respects a non-USD currency", () => {
    assert.equal(formatCurrency(999, "EUR", "en-US"), "€9.99");
  });
});

describe("countWords", () => {
  it("counts words separated by any whitespace", () => {
    assert.equal(countWords("the quick brown fox"), 4);
    assert.equal(countWords("line one\nline two"), 4);
    assert.equal(countWords("  padded   spacing  "), 2);
  });

  it("returns zero for empty or whitespace-only input", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords("   \n\t "), 0);
  });

  it("counts non-Latin scripts that use spaces", () => {
    assert.equal(countWords("Привет мир"), 2);
  });
});

describe("initialsFrom", () => {
  it("uses the first two name parts", () => {
    assert.equal(initialsFrom("Ada Lovelace", "ada@example.com"), "AL");
  });

  it("falls back to the email when there is no name", () => {
    assert.equal(initialsFrom(null, "ada.lovelace@example.com"), "AL");
  });

  it("handles a single-word name", () => {
    assert.equal(initialsFrom("Prince", "p@example.com"), "PR");
  });
});

describe("pluralize", () => {
  it("uses the singular for exactly one", () => {
    assert.equal(pluralize(1, "credit"), "credit");
    assert.equal(pluralize(0, "credit"), "credits");
    assert.equal(pluralize(2, "credit"), "credits");
  });
});
