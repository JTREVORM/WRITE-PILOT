"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { extractRubricAction } from "@/lib/grading/actions";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import type { ActionResult } from "@/lib/utils/result";

const MIN_WORDS = 15;

/**
 * Extracting a rubric.
 *
 * Separate from grading because a rubric is extracted once and graded against
 * many times — and because a user should be able to correct a misread criterion
 * before any submission is judged on it.
 */
export function RubricForm({
  creditCost,
  balance,
  maxFileSizeMb,
}: {
  creditCost: number;
  balance: number;
  maxFileSizeMb: number;
}) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(extractRubricAction, null);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = file ? null : countWords(text);
  const tooShort = wordCount !== null && wordCount > 0 && wordCount < MIN_WORDS;
  const canAfford = balance >= creditCost;

  const ready =
    !isPending &&
    canAfford &&
    (file !== null || (wordCount !== null && wordCount >= MIN_WORDS));

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {!canAfford ? (
        <Alert tone="warning">
          Reading a rubric costs {creditCost} credits and you have{" "}
          {formatNumber(balance)}.
        </Alert>
      ) : null}

      <Field label="Rubric name" htmlFor="rubricTitle" hint="Optional.">
        <Input name="rubricTitle" placeholder="e.g. CS 1102 Assignment 1" />
      </Field>

      <Field
        label="Rubric"
        htmlFor="rubricText"
        hint="Paste the marking criteria, or upload the rubric document."
      >
        <Textarea
          name="rubricText"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={file !== null || isPending}
          rows={8}
          placeholder={"Introduction — 10 points\nArgument — 20 points\nEvidence — 20 points…"}
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
                tooShort && "text-warning-700 dark:text-warning-500",
              )}
            >
              {formatNumber(wordCount ?? 0)} words
              {tooShort ? ` — ${MIN_WORDS} needed` : ""}
            </span>
          )}
        </div>

        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted",
            isPending && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="size-4" aria-hidden="true" />
          {file ? "Choose another file" : "Upload rubric"}
          <input
            ref={fileInputRef}
            type="file"
            name="rubricFile"
            accept={ACCEPT_ATTRIBUTE}
            disabled={isPending}
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
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. You can correct any criterion
        afterwards before grading against it.
      </p>

      <div className="border-t border-line pt-5">
        <Button type="submit" loading={isPending} disabled={!ready}>
          {isPending ? "Reading…" : `Read rubric (${creditCost} credits)`}
        </Button>
      </div>
    </form>
  );
}
