import { cn } from "@/lib/utils/cn";
import { bandFor } from "@/lib/detection/scoring";
import type { ScanSegment } from "@/lib/detection/queries";

const TINTS: Record<string, string> = {
  low: "border-l-detect-low bg-detect-low-track/40",
  moderate: "border-l-detect-moderate bg-detect-moderate-track/40",
  elevated: "border-l-detect-elevated bg-detect-elevated-track/50",
  high: "border-l-detect-high bg-detect-high-track/50",
};

/**
 * Paragraph-level detail.
 *
 * Renders the stored text split by the offsets recorded at scan time, with each
 * paragraph tinted by its own estimate. Offsets were computed server-side from
 * the same split that was sent for analysis, so a highlight always lands on the
 * passage it describes.
 *
 * The tint is never the only cue: every paragraph carries its percentage and a
 * one-line rationale, which is also what makes the result useful — "which parts"
 * is a far more actionable answer than a single number for the whole document.
 */
export function SegmentView({
  content,
  segments,
}: {
  content: string;
  segments: ScanSegment[];
}) {
  if (segments.length === 0) {
    return (
      <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-5 text-sm leading-relaxed">
        {content}
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {segments.map((segment) => {
        const text = content.slice(segment.start_offset, segment.end_offset);
        const band = bandFor(segment.estimated_ai_likelihood);

        return (
          <li
            key={segment.id}
            className={cn(
              "rounded-r-lg border border-l-4 border-line py-3 pl-4 pr-4",
              TINTS[band.key],
            )}
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs font-medium text-foreground-muted">
                Paragraph {segment.position + 1}
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {segment.estimated_ai_likelihood}%
              </span>
              <span className="text-xs text-foreground-subtle">{band.label}</span>
            </div>

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {text}
            </p>

            {segment.rationale ? (
              <p className="mt-2 border-t border-line pt-2 text-xs leading-relaxed text-foreground-muted">
                {segment.rationale}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
