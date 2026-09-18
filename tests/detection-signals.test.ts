import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeSignals,
  splitParagraphs,
  splitSentences,
  words,
} from "../src/lib/detection/signals.ts";

/**
 * The paragraph split is the safety-critical piece here: the offsets it
 * produces are what every highlight in the result view is drawn from, and the
 * same split is what the model is asked to score by index. If these drift, a
 * result gets attached to the wrong passage.
 */
describe("splitParagraphs", () => {
  it("splits on blank lines and reports exact offsets", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const paragraphs = splitParagraphs(text);

    assert.equal(paragraphs.length, 2);
    assert.equal(paragraphs[0]!.text, "First paragraph.");
    assert.equal(paragraphs[1]!.text, "Second paragraph.");

    // The offsets must slice back to exactly the same text.
    for (const paragraph of paragraphs) {
      assert.equal(
        text.slice(paragraph.start, paragraph.end),
        paragraph.text,
        "offsets must round-trip through the original text",
      );
    }
  });

  it("keeps single newlines inside one paragraph", () => {
    const paragraphs = splitParagraphs("Line one\nline two.\n\nNext.");
    assert.equal(paragraphs.length, 2);
    assert.equal(paragraphs[0]!.text, "Line one\nline two.");
  });

  it("round-trips offsets when there is leading whitespace", () => {
    const text = "\n\n   Indented opening.\n\n  Second one.\n";
    for (const paragraph of splitParagraphs(text)) {
      assert.equal(text.slice(paragraph.start, paragraph.end), paragraph.text);
    }
  });

  it("collapses runs of blank lines rather than emitting empty paragraphs", () => {
    const paragraphs = splitParagraphs("One.\n\n\n\n\nTwo.");
    assert.equal(paragraphs.length, 2);
  });

  it("returns nothing for whitespace-only input", () => {
    assert.equal(splitParagraphs("   \n\n  \t ").length, 0);
    assert.equal(splitParagraphs("").length, 0);
  });
});

describe("splitSentences", () => {
  it("splits on terminal punctuation", () => {
    assert.equal(
      splitSentences("One idea. Another idea! A third? Yes.").length,
      4,
    );
  });

  it("does not split on common abbreviations", () => {
    // Splitting here would inflate the sentence count and wreck the
    // length statistics the whole signal set depends on.
    const sentences = splitSentences(
      "Dr. Smith cited Jones et al. in the review. It was convincing.",
    );
    assert.equal(sentences.length, 2);
  });

  it("does not split on initials", () => {
    assert.equal(splitSentences("Written by J. R. Firth in 1957.").length, 1);
  });

  it("keeps a trailing fragment with no full stop", () => {
    const sentences = splitSentences("Complete sentence. Trailing fragment");
    assert.equal(sentences.length, 2);
    assert.equal(sentences[1], "Trailing fragment");
  });

  it("ignores punctuation with no words around it", () => {
    assert.equal(splitSentences("...").length, 0);
    assert.equal(splitSentences("").length, 0);
  });
});

describe("words", () => {
  it("counts words across scripts and keeps apostrophes", () => {
    assert.deepEqual(words("don't stop"), ["don't", "stop"]);
    assert.equal(words("Привет мир").length, 2);
    assert.equal(words("").length, 0);
  });
});

describe("analyzeSignals", () => {
  const varied =
    "The argument collapses. Not because the evidence is thin — though it is — " +
    "but because the author never states what would count as disconfirmation.\n\n" +
    "I spent a week on this. Nothing worked; then it did, suddenly, and I still " +
    "can't say why. Was it the sampling? Maybe.";

  const uniform =
    "Moreover, the framework provides a comprehensive approach to the problem. " +
    "Furthermore, the framework provides a robust approach to the problem. " +
    "Additionally, the framework provides a nuanced approach to the problem.\n\n" +
    "Moreover, the framework provides a comprehensive approach to the analysis. " +
    "Furthermore, the framework provides a robust approach to the analysis.";

  it("reports the shape of the text", () => {
    const result = analyzeSignals(varied);
    assert.ok(result.wordCount > 30, "counts words");
    assert.equal(result.paragraphCount, 2);
    assert.ok(result.sentenceCount >= 5);
    assert.equal(result.characterCount, varied.length);
  });

  it("measures more sentence variation in uneven prose", () => {
    assert.ok(
      analyzeSignals(varied).sentenceLengthVariation >
        analyzeSignals(uniform).sentenceLengthVariation,
      "varied prose should show a higher standard deviation",
    );
  });

  it("measures more repeated phrasing in recycled prose", () => {
    assert.ok(
      analyzeSignals(uniform).repeatedPhraseRate >
        analyzeSignals(varied).repeatedPhraseRate,
    );
  });

  it("measures higher connective density in formulaic prose", () => {
    assert.ok(
      analyzeSignals(uniform).connectiveDensity >
        analyzeSignals(varied).connectiveDensity,
    );
  });

  it("produces a full set of displayable signals", () => {
    const { signals } = analyzeSignals(varied);
    assert.equal(signals.length, 6);

    for (const signal of signals) {
      assert.ok(signal.key.length > 0);
      assert.ok(signal.label.length > 0);
      assert.ok(signal.value.length > 0, `${signal.key} needs a value`);
      assert.ok(["varied", "neutral", "uniform"].includes(signal.lean));
    }
  });

  it("does not divide by zero on empty input", () => {
    const result = analyzeSignals("");
    assert.equal(result.wordCount, 0);
    assert.equal(result.meanSentenceLength, 0);
    assert.equal(result.lexicalDiversity, 0);
    assert.ok(Number.isFinite(result.repeatedPhraseRate));
    assert.ok(Number.isFinite(result.connectiveDensity));
  });

  it("is deterministic", () => {
    assert.deepEqual(analyzeSignals(varied), analyzeSignals(varied));
  });
});
