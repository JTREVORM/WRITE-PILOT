/**
 * Naturalize modes.
 *
 * Each mode is a different answer to "better for what?" — the same paragraph
 * improved for a supervisor reads differently from the same paragraph improved
 * for a general audience. The guidance strings go into the prompt; the label
 * and description go into the interface, so the two can never drift apart.
 */

export type NaturalizeModeKey =
  | "natural"
  | "academic"
  | "professional"
  | "formal"
  | "simple"
  | "conversational"
  | "concise";

export interface NaturalizeMode {
  key: NaturalizeModeKey;
  label: string;
  /** One line, shown beside the mode in the picker. */
  description: string;
  /** Instruction added to the prompt for this mode. */
  guidance: string;
}

export const NATURALIZE_MODES: readonly NaturalizeMode[] = [
  {
    key: "natural",
    label: "Natural",
    description: "Smoother and easier to read, in your own voice.",
    guidance:
      "Improve flow and readability while keeping the writer's voice intact. " +
      "Fix awkward phrasing and clunky transitions. Do not make it more formal " +
      "or less formal than it already is.",
  },
  {
    key: "academic",
    label: "Academic",
    description: "Precise and measured, for coursework and papers.",
    guidance:
      "Tighten toward careful academic prose: precise claims, appropriate " +
      "hedging, clear logical connectives. Keep technical terminology exactly " +
      "as written. Do not add citations, evidence or claims that are not " +
      "already there.",
  },
  {
    key: "professional",
    label: "Professional",
    description: "Clear and confident, for work and clients.",
    guidance:
      "Aim for clear, confident workplace writing. Remove hedging that weakens " +
      "the point, cut filler, and keep sentences direct. Stay warm rather than " +
      "stiff.",
  },
  {
    key: "formal",
    label: "Formal",
    description: "More formal register, for official writing.",
    guidance:
      "Raise the register: no contractions, no colloquialisms, complete " +
      "sentences, measured tone. Do not make it longer or more ornate — formal " +
      "is not the same as verbose.",
  },
  {
    key: "simple",
    label: "Simple",
    description: "Plainer language a wider audience can follow.",
    guidance:
      "Make it easier to follow: shorter sentences, everyday words where an " +
      "everyday word will do, one idea per sentence. Keep necessary technical " +
      "terms but explain nothing the writer did not already explain. Do not " +
      "remove content.",
  },
  {
    key: "conversational",
    label: "Conversational",
    description: "Warmer and more direct, for blogs and email.",
    guidance:
      "Make it sound like a person talking to another person: contractions are " +
      "fine, address the reader directly where it fits, vary sentence length. " +
      "Do not become chatty or add jokes.",
  },
  {
    key: "concise",
    label: "Concise",
    description: "Shorter, with nothing important lost.",
    guidance:
      "Cut length without losing content. Remove padding, redundant modifiers " +
      "and restated points. Every fact, figure, citation and claim in the " +
      "original must survive — this mode shortens the wording, never the " +
      "substance.",
  },
] as const;

const BY_KEY = new Map(NATURALIZE_MODES.map((mode) => [mode.key, mode]));

export const DEFAULT_MODE: NaturalizeModeKey = "natural";

export function isNaturalizeMode(value: unknown): value is NaturalizeModeKey {
  return typeof value === "string" && BY_KEY.has(value as NaturalizeModeKey);
}

export function getMode(key: string): NaturalizeMode {
  return BY_KEY.get(key as NaturalizeModeKey) ?? BY_KEY.get(DEFAULT_MODE)!;
}
