import { routes } from "./routes";
import type { IconName } from "@/components/ui/icon";
import type { AppRole } from "@/types/database";

/**
 * Application navigation.
 *
 * Icons are referenced by name, not by component. This config is read by the
 * server and handed to Client Components (the mobile drawer, the nav links),
 * and a component reference cannot cross that boundary — everything here must
 * stay plain, serializable data.
 *
 * Items carry an availability flag so the shell can present the full product
 * shape while only linking what actually exists. A tool that has not been built
 * yet is shown as unavailable rather than linking to a dead route — the user
 * gets an honest picture of the product, and each later phase only has to flip
 * one flag.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  description?: string;
  /** false until the phase that implements it lands. */
  available: boolean;
  requiresRole?: AppRole;
  badge?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: routes.dashboard,
        icon: "dashboard",
        description: "Your plan, credits and recent activity",
        available: true,
      },
    ],
  },
  {
    title: "Tools",
    items: [
      {
        label: "AI Detector",
        href: routes.aiDetector,
        icon: "detector",
        description: "Estimate how likely a text is AI-generated",
        available: true,
      },
      {
        label: "Grammar Checker",
        href: routes.grammar,
        icon: "grammar",
        description: "Grammar, clarity and readability suggestions",
        available: true,
      },
      {
        label: "Naturalize",
        href: routes.naturalize,
        icon: "naturalize",
        description: "Improve flow and readability, keep your meaning",
        available: true,
      },
      {
        label: "AI Grader",
        href: routes.grader,
        icon: "grader",
        description: "An estimated grade against a rubric",
        available: true,
      },
      {
        label: "Writing Coach",
        href: routes.coach,
        icon: "coach",
        description: "A full review, ordered by what to do first",
        available: true,
      },
      {
        label: "Citation Checker",
        href: routes.citations,
        icon: "citations",
        description: "Check citations against APA, MLA, Chicago or Harvard",
        available: true,
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      {
        label: "Documents",
        href: routes.documents,
        icon: "documents",
        description: "Upload once, reuse in every tool",
        available: true,
      },
      {
        label: "Assignments",
        href: routes.assignments,
        icon: "assignments",
        description: "Brief, rubric and drafts in one place",
        available: true,
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Usage & credits",
        href: routes.usage,
        icon: "usage",
        description: "What you've used and what's left",
        available: true,
      },
      {
        label: "Billing",
        href: routes.billing,
        icon: "plan",
        description: "Plan, credits and payment history",
        available: true,
      },
      {
        label: "Settings",
        href: routes.settings,
        icon: "settings",
        description: "Profile and account preferences",
        available: true,
      },
      {
        label: "Admin",
        href: routes.admin,
        icon: "security",
        available: false,
        requiresRole: "admin",
      },
    ],
  },
];

/** Dashboard quick actions, in the order a student would reach for them. */
export const quickActions: NavItem[] = [
  {
    label: "AI Detector",
    href: routes.aiDetector,
    icon: "detector",
    description: "Check estimated AI likelihood",
    available: true,
  },
  {
    label: "Check Grammar",
    href: routes.grammar,
    icon: "grammar",
    description: "Fix grammar and clarity",
    available: true,
  },
  {
    label: "Naturalize",
    href: routes.naturalize,
    icon: "naturalize",
    description: "Improve flow and readability",
    available: true,
  },
  {
    label: "Grade Assignment",
    href: routes.grader,
    icon: "grader",
    description: "Estimate a grade from a rubric",
    available: true,
  },
  {
    label: "Review a Draft",
    href: routes.coach,
    icon: "coach",
    description: "What to change, in order",
    available: true,
  },
  {
    label: "Check Citations",
    href: routes.citations,
    icon: "citations",
    description: "Validate references and style",
    available: true,
  },
  {
    label: "Upload Document",
    href: routes.documents,
    icon: "upload",
    description: "Add a PDF, DOCX or TXT",
    available: true,
  },
];

/** Filters out items the current roles may not see. */
export function visibleSections(roles: AppRole[]): NavSection[] {
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.requiresRole || roles.includes(item.requiresRole),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
