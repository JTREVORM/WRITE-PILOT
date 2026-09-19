import { Info } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { COACH_DISCLAIMER } from "@/lib/coach/priority";

/**
 * The standing qualification on a review.
 *
 * Beside the list, not behind a link. A prioritised list of changes reads like
 * instructions, and the one thing a student must not do is follow it over their
 * own brief.
 */
export function CoachDisclaimer({ className }: { className?: string }) {
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
      <p className="text-xs leading-relaxed text-foreground-muted">
        {COACH_DISCLAIMER}
      </p>
    </div>
  );
}
