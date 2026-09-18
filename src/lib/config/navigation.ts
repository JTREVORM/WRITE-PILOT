import {
  BarChart3,
  BookMarked,
  FileSearch,
  FileText,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  Quote,
  Settings,
  ShieldCheck,
  SpellCheck,
  Sparkles,
  Upload,
} from "lucide-react";

import { routes } from "./routes";
import type { AppRole } from "@/types/database";

/**
 * Application navigation.
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
  icon: LucideIcon;
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
        icon: LayoutDashboard,
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
        href: "/tools/ai-detector",
        icon: FileSearch,
        description: "Estimate how likely a text is AI-generated",
        available: false,
      },
      {
        label: "Grammar Checker",
        href: "/tools/grammar",
        icon: SpellCheck,
        description: "Grammar, clarity and readability suggestions",
        available: false,
      },
      {
        label: "Naturalize",
        href: "/tools/naturalize",
        icon: Sparkles,
        description: "Improve flow and readability, keep your meaning",
        available: false,
      },
      {
        label: "AI Grader",
        href: "/tools/grader",
        icon: GraduationCap,
        description: "An estimated grade against a rubric",
        available: false,
      },
      {
        label: "Citation Checker",
        href: "/tools/citations",
        icon: Quote,
        description: "Check citations against APA, MLA, Chicago or Harvard",
        available: false,
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      {
        label: "Documents",
        href: routes.documents,
        icon: FileText,
        description: "Your document library",
        available: false,
      },
      {
        label: "Assignments",
        href: "/assignments",
        icon: BookMarked,
        description: "Instructions, rubric, drafts and feedback in one place",
        available: false,
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Usage & credits",
        href: routes.usage,
        icon: BarChart3,
        description: "What you've used and what's left",
        available: true,
      },
      {
        label: "Settings",
        href: routes.settings,
        icon: Settings,
        description: "Profile and account preferences",
        available: true,
      },
      {
        label: "Admin",
        href: routes.admin,
        icon: ShieldCheck,
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
    href: "/tools/ai-detector",
    icon: FileSearch,
    description: "Check estimated AI likelihood",
    available: false,
  },
  {
    label: "Check Grammar",
    href: "/tools/grammar",
    icon: SpellCheck,
    description: "Fix grammar and clarity",
    available: false,
  },
  {
    label: "Naturalize",
    href: "/tools/naturalize",
    icon: Sparkles,
    description: "Improve flow and readability",
    available: false,
  },
  {
    label: "Grade Assignment",
    href: "/tools/grader",
    icon: GraduationCap,
    description: "Estimate a grade from a rubric",
    available: false,
  },
  {
    label: "Check Citations",
    href: "/tools/citations",
    icon: Quote,
    description: "Validate references and style",
    available: false,
  },
  {
    label: "Upload Document",
    href: routes.documents,
    icon: Upload,
    description: "Add a PDF, DOCX or TXT",
    available: false,
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
