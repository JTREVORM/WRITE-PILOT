import { Info } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { CITATION_LIMITS } from "@/lib/citations/styles";

/**
 * What this tool does not do.
 *
 * A citation checker that let someone believe their sources had been verified
 * would be worse than no checker at all — they would stop checking. So the
 * limits sit on the result screen next to the findings, not on a help page.
 */
export function CitationLimits({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-line bg-surface-muted/60 p-4",
        className,
      )}
    >
      <Info
        className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
        aria-hidden="true"
      />
      <div className="space-y-1.5">
        <p className="text-xs font-medium">What this check covers</p>
        <ul className="space-y-1">
          {CITATION_LIMITS.map((limit) => (
            <li key={limit} className="text-xs leading-relaxed text-foreground-muted">
              {limit}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
