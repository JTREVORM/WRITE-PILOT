import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { FAQS, HOW_IT_WORKS, TOOL_SUMMARIES } from "../src/lib/config/marketing.ts";

/**
 * The product-integrity guard, in code.
 *
 * WritePilot's position — that it improves writing rather than disguising
 * authorship, that detection is an estimate and an AI grade is not a grade —
 * is easy to hold while writing one page and easy to lose on the fifth. These
 * tests read the marketing copy and the public pages as text and fail on the
 * claims we have decided never to make.
 *
 * A failure here is not a style note. It means a page is about to promise
 * something the product deliberately does not do.
 */

/** Claims WritePilot does not make, as they would actually be written. */
const FORBIDDEN_CLAIMS: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /beat\s+(turnitin|ai\s+detect|plagiarism)/i,
    why: "we do not market WritePilot as a way to beat detection systems",
  },
  {
    pattern: /bypass\s+(ai\s+)?(detect|turnitin|plagiarism)/i,
    why: "we do not market bypassing detection",
  },
  {
    pattern: /undetectable/i,
    why: "we do not claim to make writing undetectable",
  },
  {
    pattern: /100%\s*(undetectable|human|accurate|guaranteed)/i,
    why: "we do not make absolute accuracy claims",
  },
  {
    pattern: /guarantee[ds]?\s+(a\s+)?(grade|pass|mark|acceptance|first)/i,
    why: "we do not guarantee an academic outcome",
  },
  {
    pattern: /\b(proof|proves)\s+of\s+(ai|authorship)/i,
    why: "detection is an estimate, never proof of authorship",
  },
  {
    pattern: /official\s+grade\b(?!\s*[.,]?\s*(and|it|—|-)?\s*(is\s+)?(not|never))/i,
    why: "an AI grade is never presented as an official grade",
  },
];

/** Copy is allowed to name a claim in order to reject it. */
function isRejection(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 160), index + 160).toLowerCase();
  return /\b(not|never|do not|don't|cannot|no |refus|deliberately|without)\b/.test(
    window,
  );
}

function offendingClaims(text: string): string[] {
  const found: string[] = [];

  for (const { pattern, why } of FORBIDDEN_CLAIMS) {
    const regex = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);

    for (const match of text.matchAll(regex)) {
      if (isRejection(text, match.index ?? 0)) continue;
      found.push(`"${match[0]}" — ${why}`);
    }
  }

  return found;
}

describe("marketing copy", () => {
  // A question and its answer are read as one unit: naming a claim in order to
  // refuse it is exactly what the FAQ is for, and the refusal is in the answer.
  const corpus = [
    ...FAQS.map((faq) => `${faq.question}\n${faq.answer}`),
    ...TOOL_SUMMARIES.map((tool) => tool.body),
    ...HOW_IT_WORKS.map((step) => step.body),
  ];

  it("makes no claim the product refuses to make", () => {
    for (const text of corpus) {
      assert.deepEqual(offendingClaims(text), [], text);
    }
  });

  it("answers the detector question rather than avoiding it", () => {
    const answer = FAQS.find((faq) =>
      /undetectable|detector/i.test(faq.question),
    );

    assert.ok(answer, "the question people actually ask must be answered");
    assert.match(answer.answer, /^No\b/, "the answer opens with the answer");
  });

  it("describes detection as an estimate wherever it describes it at all", () => {
    const detector = TOOL_SUMMARIES.find((tool) => tool.name === "AI Detector");
    assert.ok(detector);
    assert.match(detector.body, /estimat/i);
  });

  it("describes the grade as an estimate, not a grade", () => {
    const grader = TOOL_SUMMARIES.find((tool) => tool.name === "AI Grader");
    assert.ok(grader);
    assert.match(grader.body, /estimated grade/i);
  });

  it("gives every tool a distinct name and a body worth reading", () => {
    const names = TOOL_SUMMARIES.map((tool) => tool.name);
    assert.equal(new Set(names).size, names.length, "duplicate tool names");

    for (const tool of TOOL_SUMMARIES) {
      assert.ok(tool.body.length > 60, `${tool.name} needs a real description`);
    }
  });
});

describe("the public pages", () => {
  /** Every .tsx under the marketing route group, read as source. */
  function collect(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) collect(path, files);
      else if (path.endsWith(".tsx")) files.push(path);
    }
    return files;
  }

  const pages = collect("src/app/(marketing)");

  it("finds the pages it is meant to be checking", () => {
    // A test that silently checks nothing is worse than no test.
    assert.ok(pages.length >= 5, `only found ${pages.length} marketing pages`);
  });

  it("makes no claim the product refuses to make", () => {
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      assert.deepEqual(offendingClaims(source), [], page);
    }
  });
});
