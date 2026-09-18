import { publicEnv } from "@/lib/env/public";

/**
 * Single source of truth for brand copy and public URLs. Marketing surfaces,
 * metadata and transactional email all read from here so a wording change lands
 * everywhere at once.
 */
export const siteConfig = {
  name: "WritePilot",
  tagline: "Write smarter. Check deeper.",
  description:
    "AI-powered tools for writing, grading, grammar, citations and document " +
    "improvement — all in one workspace.",
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  locale: "en",
  supportEmail: "support@writepilot.app",
} as const;

/**
 * Wording rules that apply wherever a result is shown to a user.
 *
 * WritePilot does not claim certainty it does not have. Detection is an
 * estimate, and an AI grade is not an academic grade. These strings exist so
 * that framing stays consistent across every feature built in later phases
 * rather than being re-invented per screen.
 */
export const disclaimers = {
  aiDetection:
    "This is an estimated likelihood, not proof of authorship. AI detection " +
    "can produce false positives — particularly for non-native English " +
    "writers and heavily edited text — and should never be treated as " +
    "conclusive evidence.",
  aiGrading:
    "This is an AI-assisted estimated grade intended to guide revision. It is " +
    "not an official grade and does not predict how your work will be marked.",
  naturalize:
    "Naturalize improves clarity, flow and readability while preserving your " +
    "meaning. It is a writing-improvement tool, not a way to disguise " +
    "authorship.",
} as const;
