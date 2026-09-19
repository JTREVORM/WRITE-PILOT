import { cn } from "@/lib/utils/cn";
import { diffWords, type DiffRun } from "@/lib/naturalize/diff";

/**
 * Inline word-level comparison of one paragraph.
 *
 * Removals and additions are marked with strikethrough and underline as well as
 * colour, so the comparison is readable without relying on being able to tell
 * red from green — which is exactly the distinction a large share of readers
 * cannot make.
 */
export function DiffText({
  original,
  improved,
  className,
}: {
  original: string;
  improved: string;
  className?: string;
}) {
  const runs = diffWords(original, improved);

  return (
    <p className={cn("whitespace-pre-wrap text-sm leading-7", className)}>
      {runs.map((run, index) => (
        <DiffSpan key={index} run={run} />
      ))}
    </p>
  );
}

function DiffSpan({ run }: { run: DiffRun }) {
  if (run.kind === "equal") {
    return <span>{run.text}</span>;
  }

  // The horizontal padding is not decoration. Whitespace belongs to whichever
  // side's token carries it, so two adjacent runs can meet with no space
  // between them -- "In order" followed by "To" would otherwise read as
  // "In orderTo". The padding keeps the boundary legible without inventing
  // characters that are in neither version.
  if (run.kind === "removed") {
    return (
      <del className="mx-px rounded-sm bg-danger-50 px-0.5 text-danger-700 decoration-danger-500/70 dark:bg-danger-700/20 dark:text-danger-500">
        {run.text}
      </del>
    );
  }

  return (
    <ins className="mx-px rounded-sm bg-success-50 px-0.5 text-success-700 no-underline decoration-success-600 underline-offset-2 dark:bg-success-700/20 dark:text-success-500">
      {run.text}
    </ins>
  );
}
