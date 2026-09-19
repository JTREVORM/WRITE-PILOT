import { Info } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { GRADE_DISCLAIMER } from "@/lib/grading/score";

/**
 * The standing qualification on every estimated grade.
 *
 * Beside the number, not behind a link. A figure out of 100 looks exactly like
 * a mark, and a student deciding whether to submit is the person who most needs
 * to know it is not one.
 */
export function GradeDisclaimer({ className }: { className?: string }) {
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
        {GRADE_DISCLAIMER}
      </p>
    </div>
  );
}
