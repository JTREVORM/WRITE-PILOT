import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDetectionPrompt,
  detectionResponseSchema,
  DETECTION_SYSTEM_PROMPT,
} from "../src/lib/detection/prompt.ts";
import { analyzeSignals } from "../src/lib/detection/signals.ts";

const SAMPLE = "First paragraph here.\n\nSecond paragraph here.\n\nThird one.";

describe("buildDetectionPrompt", () => {
  it("numbers every paragraph from zero", () => {
    // The index is the only link between the model's answer and the offsets
    // computed server-side. If the numbering changes, highlights land on the
    // wrong passage.
    const prompt = buildDetectionPrompt({
      paragraphs: ["Alpha.", "Beta.", "Gamma."],
      signals: analyzeSignals(SAMPLE),
    });

    assert.ok(prompt.includes("[0]\nAlpha."));
    assert.ok(prompt.includes("[1]\nBeta."));
    assert.ok(prompt.includes("[2]\nGamma."));
  });

  it("instructs the model not to reshape the paragraph list", () => {
    const prompt = buildDetectionPrompt({
      paragraphs: ["Alpha."],
      signals: analyzeSignals(SAMPLE),
    });
    assert.match(prompt, /do not merge, split, skip or reorder/i);
  });

  it("includes the measurements the user is also shown", () => {
    const signals = analyzeSignals(SAMPLE);
    const prompt = buildDetectionPrompt({ paragraphs: ["Alpha."], signals });

    assert.ok(prompt.includes(String(signals.wordCount)));
    assert.ok(prompt.includes(String(signals.meanSentenceLength)));
  });
});

describe("DETECTION_SYSTEM_PROMPT", () => {
  it("warns against penalising non-native English writers", () => {
    // This is the single most consequential instruction in the prompt: false
    // positives here fall hardest on students writing in a second language.
    assert.match(DETECTION_SYSTEM_PROMPT, /non-native/i);
  });

  it("states that polished writing is not evidence", () => {
    assert.match(DETECTION_SYSTEM_PROMPT, /NOT evidence of generation/);
  });

  it("forbids recommending an integrity action", () => {
    assert.match(DETECTION_SYSTEM_PROMPT, /never recommend an academic-integrity action/i);
  });
});

describe("detectionResponseSchema", () => {
  const valid = {
    estimated_ai_likelihood: 62,
    summary: "Even sentence lengths across most paragraphs.",
    paragraphs: [
      { index: 0, estimated_ai_likelihood: 55, rationale: "Uniform rhythm." },
      { index: 1, estimated_ai_likelihood: 70, rationale: "Recycled phrasing." },
    ],
  };

  it("accepts a well-formed response", () => {
    assert.equal(detectionResponseSchema.safeParse(valid).success, true);
  });

  it("rejects a likelihood outside 0-100", () => {
    for (const bad of [-1, 101]) {
      assert.equal(
        detectionResponseSchema.safeParse({ ...valid, estimated_ai_likelihood: bad })
          .success,
        false,
      );
    }
  });

  it("rejects a non-integer paragraph index", () => {
    assert.equal(
      detectionResponseSchema.safeParse({
        ...valid,
        paragraphs: [{ index: 1.5, estimated_ai_likelihood: 10, rationale: "x" }],
      }).success,
      false,
    );
  });

  it("rejects a missing likelihood", () => {
    assert.equal(
      detectionResponseSchema.safeParse({ summary: "x", paragraphs: [] }).success,
      false,
    );
  });
});
