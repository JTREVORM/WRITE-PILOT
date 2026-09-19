/**
 * What is already known about a document.
 *
 * By the time someone asks for a full review they have often already run a
 * grammar check, a citation check, maybe a grade. Those results cost credits
 * and they are *facts about this document* — so the review carries them
 * forward rather than paying a model to rediscover them, and labels them as
 * measured rather than advised.
 *
 * One signal is deliberately not carried: the AI Detector's estimated
 * likelihood. Turning that number into a to-do list would be building the
 * "make your writing undetectable" product, which WritePilot is not, whatever
 * the wording. A detection score is information about how a text reads, not an
 * instruction to change it, and the coach never treats it as one.
 */

import type { ImprovementCategory } from "./priority.ts";

export interface PriorSignals {
  grammar?: {
    openSuggestions: number;
    /** Suggestions the checker marked as changing meaning, not style. */
    significant: number;
  } | null;
  citations?: {
    orphans: number;
    uncited: number;
    style: string;
  } | null;
  grade?: {
    percentage: number | null;
    weakCriteria: Array<{ name: string; awarded: number; max: number }>;
  } | null;
  naturalize?: {
    integrityFindings: number;
  } | null;
}

export interface CarriedAction {
  title: string;
  detail: string;
  category: ImprovementCategory;
  impact: number;
  effort: number;
  measured: true;
  /** Where this came from, so the interface can link back to it. */
  origin: "grammar" | "citations" | "grading" | "naturalize";
}

/**
 * Turns prior results into improvements, without a model.
 *
 * Each one is phrased as the thing to do, not as the finding — "resolve the
 * twelve open grammar suggestions" rather than "you have twelve grammar
 * suggestions" — because the list this feeds is a list of actions and a mixed
 * list of observations and actions is neither.
 */
export function carryPriorSignals(signals: PriorSignals): CarriedAction[] {
  const actions: CarriedAction[] = [];

  const citations = signals.citations;
  if (citations && citations.orphans > 0) {
    actions.push({
      title: `Add reference entries for ${citations.orphans} cited ${
        citations.orphans === 1 ? "source" : "sources"
      }`,
      detail:
        `Your citation check found ${citations.orphans} ${
          citations.orphans === 1 ? "source" : "sources"
        } cited in the text with no entry in the reference list. ` +
        "This is the kind of gap that is noticed, and it is quick to close.",
      category: "citations",
      // A missing reference is both consequential and fast to fix, which is
      // exactly what the top of the list is for.
      impact: 5,
      effort: 2,
      measured: true,
      origin: "citations",
    });
  }

  if (citations && citations.uncited > 0) {
    actions.push({
      title: `Cite or remove ${citations.uncited} unused ${
        citations.uncited === 1 ? "entry" : "entries"
      }`,
      detail:
        `${citations.uncited} ${citations.uncited === 1 ? "entry is" : "entries are"} ` +
        `in your reference list but never cited. ${citations.style} lists the works you cited.`,
      category: "citations",
      impact: 3,
      effort: 1,
      measured: true,
      origin: "citations",
    });
  }

  const grade = signals.grade;
  if (grade && grade.weakCriteria.length > 0) {
    const worst = grade.weakCriteria[0]!;
    actions.push({
      title: `Strengthen "${worst.name}"`,
      detail:
        `Your estimated grade scored this criterion ${worst.awarded} of ${worst.max}` +
        (grade.weakCriteria.length > 1
          ? `, the weakest of ${grade.weakCriteria.length} criteria below half marks. `
          : ", the weakest criterion in the rubric. ") +
        "The criterion breakdown says what the rubric asked for that the work does not yet contain.",
      category: "argument",
      impact: 5,
      effort: 4,
      measured: true,
      origin: "grading",
    });
  }

  const naturalize = signals.naturalize;
  if (naturalize && naturalize.integrityFindings > 0) {
    actions.push({
      title: `Check ${naturalize.integrityFindings} ${
        naturalize.integrityFindings === 1 ? "thing" : "things"
      } a rewrite may have dropped`,
      detail:
        "A Naturalize run on this document flagged figures, citations or quotations " +
        "that did not survive the rewrite. Losing one of those is worse than any " +
        "amount of awkward phrasing.",
      category: "evidence",
      impact: 5,
      effort: 1,
      measured: true,
      origin: "naturalize",
    });
  }

  const grammar = signals.grammar;
  if (grammar && grammar.significant > 0) {
    actions.push({
      title: `Resolve ${grammar.significant} significant grammar ${
        grammar.significant === 1 ? "suggestion" : "suggestions"
      }`,
      detail:
        `Your grammar check has ${grammar.significant} open ${
          grammar.significant === 1 ? "suggestion" : "suggestions"
        } it judged to change meaning rather than style. Those are worth reading one by one.`,
      category: "mechanics",
      impact: 4,
      effort: 2,
      measured: true,
      origin: "grammar",
    });
  } else if (grammar && grammar.openSuggestions > 0) {
    actions.push({
      title: `Work through ${grammar.openSuggestions} open grammar ${
        grammar.openSuggestions === 1 ? "suggestion" : "suggestions"
      }`,
      detail:
        "None of them change your meaning, so this is polish rather than repair — " +
        "but it is quick polish.",
      category: "mechanics",
      impact: 2,
      effort: 2,
      measured: true,
      origin: "grammar",
    });
  }

  return actions;
}
