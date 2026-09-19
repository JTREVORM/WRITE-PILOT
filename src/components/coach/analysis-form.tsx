"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { runAnalysisAction } from "@/lib/coach/actions";
import { MIN_WORDS_FOR_ANALYSIS } from "@/lib/coach/constants";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import {
  SelectedDocument,
  type SelectedToolDocument,
} from "@/components/documents/selected-document";
import { routes } from "@/lib/config/routes";
import type { ActionResult } from "@/lib/utils/result";
import type { AssignmentListItem } from "@/lib/assignments/queries";

/**
 * Starting a review.
 *
 * The assignment picker is the part that matters: a review that does not know
 * what was asked for is reviewing an essay in the abstract. Choosing one hands
 * the brief and its rubric to the review, which is usually the difference
 * between advice and generalities.
 */
export function AnalysisForm({
  creditCost,
  maxWords,
  maxFileSizeMb,
  balance,
  assignments,
  document = null,
}: {
  creditCost: number;
  maxWords: number | null;
  maxFileSizeMb: number;
  balance: number;
  assignments: AssignmentListItem[];
  document?: SelectedToolDocument | null;
}) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(runAnalysisAction, null);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = file ? null : countWords(text);
  const tooShort =
    wordCount !== null && wordCount > 0 && wordCount < MIN_WORDS_FOR_ANALYSIS;
  const activeWords = document ? document.wordCount : wordCount;
  const tooLong = activeWords !== null && maxWords !== null && activeWords > maxWords;
  const canAfford = balance >= creditCost;

  const ready =
    !isPending &&
    canAfford &&
    (document !== null ||
      file !== null ||
      (wordCount !== null && wordCount >= MIN_WORDS_FOR_ANALYSIS)) &&
    !tooLong;

  return (
    <form action={formAction} className="space-y-5">
      {document ? (
        <SelectedDocument document={document} toolHref={routes.coach} />
      ) : null}

      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {!canAfford ? (
        <Alert tone="warning">
          A full review costs {creditCost} credits and you have{" "}
          {formatNumber(balance)}.
        </Alert>
      ) : null}

      {assignments.length > 0 ? (
        <Field
          label="Reviewed against"
          htmlFor="assignmentId"
          hint="Optional, and the single biggest improvement to the advice you get."
        >
          <Select id="assignmentId" name="assignmentId" disabled={isPending}>
            <option value="">No brief — review the draft on its own</option>
            {assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.title}
                {assignment.course ? ` — ${assignment.course}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label="Your draft"
        htmlFor="text"
        hint={
          maxWords
            ? `Up to ${formatNumber(maxWords)} words on your plan.`
            : undefined
        }
      >
        <Textarea
          id="text"
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={document !== null || file !== null || isPending}
          rows={12}
          className="min-h-56"
          placeholder="Paste the draft you want reviewed…"
        />
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
              {tooShort ? ` — ${MIN_WORDS_FOR_ANALYSIS} needed` : ""}
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
          {file ? "Choose another file" : "Upload a draft"}
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
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. Checks you have already run
        on a document in your library are carried into the review rather than
        charged for twice.
      </p>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending} disabled={!ready}>
          {isPending ? "Reviewing…" : `Review this draft (${creditCost} credits)`}
        </Button>
        <p className="text-xs text-foreground-muted">
          Credits are only charged when it succeeds.
        </p>
      </div>
    </form>
  );
}
