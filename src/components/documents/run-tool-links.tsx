import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { routes } from "@/lib/config/routes";

/**
 * Sending a document to a tool.
 *
 * This is the point of the library: a document is uploaded once, and every tool
 * takes it by id rather than by re-upload. The link carries `?documentId=`, the
 * tool's form reads it, and the run is stored against the document — which is
 * what makes the history on this page fill up.
 */
const TOOLS: Array<{ label: string; href: string; icon: IconName; blurb: string }> = [
  {
    label: "AI Detector",
    href: routes.aiDetector,
    icon: "detector",
    blurb: "Estimate AI-generated likelihood",
  },
  {
    label: "Grammar Checker",
    href: routes.grammar,
    icon: "grammar",
    blurb: "Grammar, clarity and readability",
  },
  {
    label: "Naturalize",
    href: routes.naturalize,
    icon: "naturalize",
    blurb: "Improve flow, keep the meaning",
  },
  {
    label: "AI Grader",
    href: routes.grader,
    icon: "grader",
    blurb: "An estimate against your rubric",
  },
  {
    label: "Citation Checker",
    href: routes.citations,
    icon: "citations",
    blurb: "References and citation style",
  },
];

export function RunToolLinks({ documentId }: { documentId: string }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {TOOLS.map((tool) => (
        <li key={tool.href}>
          <Link href={`${tool.href}?documentId=${documentId}`} className="block">
            <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-muted">
              <Icon
                name={tool.icon}
                className="size-4 shrink-0 text-foreground-subtle"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{tool.label}</span>
                <span className="block truncate text-xs text-foreground-muted">
                  {tool.blurb}
                </span>
              </span>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
