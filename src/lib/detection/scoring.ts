import type { DetectionConfidence } from "@/types/database";

/**
 * How a detection result is described to a user.
 *
 * This module exists so the framing is decided once, deliberately, rather than
 * re-invented per screen. The product position is fixed: a likelihood is an
 * estimate, never a finding of authorship, and the wording below never says
 * otherwise. No band is called "AI-generated"; the strongest is "strong
 * indicators", which is what the underlying measurement can actually support.
 */

export interface LikelihoodBand {
  key: "low" | "moderate" | "elevated" | "high";
  /** Short label for a badge. */
  label: string;
  /** A sentence a user can act on. */
  summary: string;
  tone: "success" | "neutral" | "warning" | "danger";
}

export function bandFor(likelihood: number): LikelihoodBand {
  const score = clampLikelihood(likelihood);

  if (score < 25) {
    return {
      key: "low",
      label: "Few AI indicators",
      summary:
        "This text shows the variation typical of human drafting. That is not a guarantee of authorship.",
      tone: "success",
    };
  }

  if (score < 50) {
    return {
      key: "moderate",
      label: "Mixed signals",
      summary:
        "Some passages read as more uniform than others. Mixed results are common in edited or collaborative writing.",
      tone: "neutral",
    };
  }

  if (score < 75) {
    return {
      key: "elevated",
      label: "Elevated AI indicators",
      summary:
        "Several patterns associated with generated text are present. Heavily edited or formulaic academic writing can read this way too.",
      tone: "warning",
    };
  }

  return {
    key: "high",
    label: "Strong AI indicators",
    summary:
      "Most of this text shows patterns associated with generated writing. This remains an estimate, not a determination.",
    tone: "danger",
  };
}

export function clampLikelihood(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * How much weight the result deserves, from the amount of evidence available.
 *
 * Short passages genuinely carry less signal — a 60-word abstract cannot
 * support the same confidence as a 3,000-word chapter — and saying so is more
 * useful than presenting every percentage as equally solid.
 */
export function confidenceFor(params: {
  wordCount: number;
  paragraphCount: number;
}): DetectionConfidence {
  const { wordCount, paragraphCount } = params;

  if (wordCount < 150 || paragraphCount < 2) return "low";
  if (wordCount < 500) return "medium";
  return "high";
}

export const CONFIDENCE_COPY: Record<
  DetectionConfidence,
  { label: string; explanation: string }
> = {
  low: {
    label: "Low confidence",
    explanation:
      "There is not much text to go on. Short passages produce unreliable estimates — treat this result as indicative at best.",
  },
  medium: {
    label: "Moderate confidence",
    explanation:
      "There is enough text for a reasonable reading, though longer samples give steadier results.",
  },
  high: {
    label: "Higher confidence",
    explanation:
      "There is a good amount of text to measure. The estimate is still an estimate.",
  },
};

/** Minimum input worth analysing at all. */
export const MIN_WORDS_FOR_DETECTION = 50;
