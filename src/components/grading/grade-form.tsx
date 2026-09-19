"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { gradeSubmissionAction } from "@/lib/grading/actions";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import type { ActionResult } from "@/lib/utils/result";
import type { RubricListItem } from "@/lib/grading/queries";
import { MIN_WORDS_FOR_GRADING } from "@/lib/grading/score";
import {
  SelectedDocument,
  type SelectedToolDocument,
} from "@/components/documents/selected-document";
import { routes } from "@/lib/config/routes";

// The server enforces this too; it is imported rather than repeated so the
// form cannot drift from the rule that actually rejects a submission.
const MIN_WORDS = MIN_WORDS_FOR_GRADING;

export function GradeForm({
  rubrics,
  creditCost,
  maxWords,
  maxFileSizeMb,
  balance,
  defaultRubricId,
  document = null,
}: {
  rubrics: RubricListItem[];
  creditCost: number;
  maxWords: number | null;
  maxFileSizeMb: number;
  balance: number;
  defaultRubricId?: string;
  /** Set when the tool was opened from the library or an assignment. */
  document?: SelectedToolDocument | null;
}) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(gradeSubmissionAction, null);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = file ? null : countWords(text);
  const tooShort = wordCount !== null && wordCount > 0 && wordCount < MIN_WORDS;
  // A chosen document wins on the server, so the gating follows its length.
  const activeWords = document ? document.wordCount : wordCount;
  const tooLong = activeWords !== null && maxWords !== null && activeWords > maxWords;
  const canAfford = balance >= creditCost;

  const ready =
    !isPending &&
    canAfford &&
    rubrics.length > 0 &&
    (document !== null ||
      file !== null ||
      (wordCount !== null && wordCount >= MIN_WORDS)) &&
    !tooLong;

  if (rubrics.length === 0) {
    return (
      <Alert tone="info" title="Read a rubric first">
        Grading needs criteria to judge against. Add a rubric and you can grade
        as many submissions against it as you like.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {document ? (
        <SelectedDocument document={document} toolHref={routes.grader} />
      ) : null}

      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {!canAfford ? (
        <Alert tone="warning">
          Grading costs {creditCost} credits and you have {formatNumber(balance)}.
        </Alert>
      ) : null}

      <Field label="Grade against" htmlFor="rubricId">
        <Select name="rubricId" defaultValue={defaultRubricId ?? rubrics[0]!.id}>
          {rubrics.map((rubric) => (
            <option key={rubric.id} value={rubric.id}>
              {rubric.title} ({rubric.criteria_count} criteria,{" "}
              {Number(rubric.total_points)} points)
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Submission"
        htmlFor="text"
        hint={
          maxWords ? `Up to ${formatNumber(maxWords)} words on your plan.` : undefined
        }
      >
        <Textarea
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={document !== null || file !== null || isPending}
          rows={10}
          className="min-h-48"
          placeholder="Paste the work to be assessed…"
        />
      </Field>

      <Field
        label="Assignment brief"
        htmlFor="instructions"
        hint="Optional. Helps the assessment understand what was actually asked for."
      >
        <Textarea name="instructions" rows={3} disabled={isPending} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-foreground-muted">
          {file ? (
            <span className="flex items-center gap-2">
              <FileText className="size-3.5" aria-hidden="true" />
              <span className="font-medium text-foreground">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="rounded p-0.5 text-foreground-subtle hover:text-foreground"
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <span
              className={cn(
                "tabular-nums",
                (tooShort || tooLong) && "text-warning-700 dark:text-warning-500",
              )}
            >
              {formatNumber(wordCount ?? 0)} words
              {tooShort ? ` — ${MIN_WORDS} needed` : ""}
              {tooLong ? " — over your plan limit" : ""}
            </span>
          )}
        </div>

        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted",
            (isPending || document !== null) && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="size-4" aria-hidden="true" />
          {file ? "Choose another file" : "Upload submission"}
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept={ACCEPT_ATTRIBUTE}
            disabled={isPending || document !== null}
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              if (selected) setText("");
            }}
          />
        </label>
      </div>

      <p className="text-xs text-foreground-subtle">
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. The result is an estimate to
        help you find gaps before submitting — never an official grade.
      </p>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending} disabled={!ready}>
          {isPending ? "Assessing…" : `Estimate grade (${creditCost} credits)`}
        </Button>
        <p className="text-xs text-foreground-muted">
          Credits are only charged when it succeeds.
        </p>
      </div>
    </form>
  );
}
