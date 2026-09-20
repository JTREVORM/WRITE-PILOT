/**
 * Marketing copy that more than one surface needs.
 *
 * The FAQ in particular is read twice: once by the page and once by the
 * structured data that describes it to a search engine. Keeping one source
 * means the answer a crawler is given is the answer a visitor reads — telling
 * them different things is both dishonest and, eventually, a penalty.
 */

import { routes } from "./routes.ts";
import type { IconName } from "@/components/ui/icon";

export interface ToolSummary {
  name: string;
  icon: IconName;
  body: string;
  href: string;
}

export const TOOL_SUMMARIES: readonly ToolSummary[] = [
  {
    name: "AI Detector",
    icon: "detector",
    body: "An estimated AI-generated likelihood with paragraph-level detail — reported as an estimate, never as proof of authorship.",
    href: routes.aiDetector,
  },
  {
    name: "Grammar Checker",
    icon: "grammar",
    body: "Grammar, punctuation, clarity and repetition, as suggestions you accept or reject one at a time.",
    href: routes.grammar,
  },
  {
    name: "Naturalize",
    icon: "naturalize",
    body: "Clearer flow and better readability in your own voice, with your figures, citations and quotations checked for survival.",
    href: routes.naturalize,
  },
  {
    name: "AI Grader",
    icon: "grader",
    body: "An AI-assisted estimated grade against your own rubric, broken down criterion by criterion with what to change.",
    href: routes.grader,
  },
  {
    name: "Citation Checker",
    icon: "citations",
    body: "Every citation matched against your reference list, and every entry read against APA 7, MLA 9, Chicago or Harvard.",
    href: routes.citations,
  },
  {
    name: "Writing Coach",
    icon: "coach",
    body: "A full review that comes back as a list, ordered by what is worth your time first — and explains any item in depth.",
    href: routes.coach,
  },
] as const;

export interface Faq {
  question: string;
  answer: string;
}

/**
 * Answers to the questions people actually ask before signing up.
 *
 * Written to be true rather than reassuring. The question about detectors is
 * the one most competitors answer with a wink; ours answers it straight,
 * because a user who discovers the real answer later is a user we have lied to.
 */
export const FAQS: readonly Faq[] = [
  {
    question: "Can WritePilot make my writing undetectable by AI detectors?",
    answer:
      "No, and we do not build for that. We do not market WritePilot as a way to beat or bypass detection systems, there is no setting that does it, and our Writing Coach is instructed never to advise changes aimed at how a detector would read your text. WritePilot improves writing; it is not a way to disguise who wrote it.",
  },
  {
    question: "Is the AI detection result proof that something was AI-written?",
    answer:
      "No. It is an estimated likelihood — a statistical reading of how a text is written, not evidence of how it was produced. No detector can prove authorship. False positives happen, and they fall hardest on non-native English writers. We say so on the result screen, not just in the small print.",
  },
  {
    question: "Is the AI grade my real grade?",
    answer:
      "No. It is an AI-assisted estimate produced by reading your work against a rubric you supply, meant to help you find gaps before you submit. It does not predict your mark, and a real marker may weigh the criteria quite differently.",
  },
  {
    question: "Am I allowed to use this for my coursework?",
    answer:
      "That depends on your institution, and often on the individual assignment. Policies vary between countries, universities and departments. It is your responsibility to know the rules that apply to your work and to follow them, including declaring assistance where you are asked to.",
  },
  {
    question: "Who can see the documents I upload?",
    answer:
      "Only you. Documents are private to the account that owns them, stored in a private bucket under your own path, and served only through short-lived links. Administering the platform does not include reading customers' writing, and the database has no policy that would allow it.",
  },
  {
    question: "How do credits work?",
    answer:
      "Every tool costs a set number of credits per run, shown on the button before you press it. Your plan's allowance arrives at the start of each billing period. Credits you buy separately never expire and are only spent once the allowance has run out. A run that fails is refunded automatically.",
  },
  {
    question: "Can I delete my documents?",
    answer:
      "Yes, at any time. Deleting a document removes it and the file behind it. Checks you already ran on it keep their own copy of the text they read — otherwise a stored report would stop matching what it reported on — and those are deletable separately.",
  },
] as const;

/** The three steps, for the landing page and for nobody else. */
export const HOW_IT_WORKS = [
  {
    title: "Add your document once",
    body: "Paste it, or upload a PDF, DOCX or TXT. It goes into your library, and every tool reads it from there without another upload.",
  },
  {
    title: "Run the checks that matter",
    body: "Grammar, citations, a rubric grade, a full review. Each one costs a stated number of credits and is stored with the document it read.",
  },
  {
    title: "Work through what it found",
    body: "Results are lists you tick off, ordered by what is worth doing first — not reports you read once and close.",
  },
] as const;
