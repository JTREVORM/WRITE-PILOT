import { Info } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { disclaimers } from "@/lib/config/site";

/**
 * The false-positive disclaimer.
 *
 * Shown with every result, not tucked behind a link. A detection score can end
 * up in front of someone deciding whether a student cheated; the limits of the
 * number belong next to the number.
 */
export function DetectionDisclaimer({ className }: { className?: string }) {
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
      <div className="space-y-2 text-xs leading-relaxed text-foreground-muted">
        <p>{disclaimers.aiDetection}</p>
        <p>
          Use it to prompt a conversation or a closer read — never as the sole
          basis for an academic-integrity decision.
        </p>
      </div>
    </div>
  );
}
