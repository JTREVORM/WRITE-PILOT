"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { runNaturalizeAction } from "@/lib/naturalize/actions";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import { DEFAULT_MODE, NATURALIZE_MODES } from "@/lib/naturalize/modes";
import type { ActionResult } from "@/lib/utils/result";

/** Kept in step with MIN_WORDS_FOR_NATURALIZE in the service. */
const MIN_WORDS = 20;

export function NaturalizeForm({
  creditCost,
  maxWords,
  maxFileSizeMb,
  balance,
}: {
  creditCost: number;
  maxWords: number | null;
  maxFileSizeMb: number;
  balance: number;
}) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(runNaturalizeAction, null);

  const [text, setText] = useState("");
  const [mode, setMode] = useState<string>(DEFAULT_MODE);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = file ? null : countWords(text);
  const tooShort = wordCount !== null && wordCount > 0 && wordCount < MIN_WORDS;
  const tooLong = wordCount !== null && maxWords !== null && wordCount > maxWords;
  const canAfford = balance >= creditCost;

  const ready =
    !isPending &&
    canAfford &&
    (file !== null || (wordCount !== null && wordCount >= MIN_WORDS)) &&
    !tooLong;

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {!canAfford ? (
        <Alert tone="warning">
          This costs {creditCost} credits and you have {formatNumber(balance)}.
          Your allowance refreshes at the start of your next billing period.
        </Alert>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-foreground">
          Improve it for
        </legend>
        <input type="hidden" name="mode" value={mode} />

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {NATURALIZE_MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={mode === option.key}
              onClick={() => setMode(option.key)}
              disabled={isPending}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                mode === option.key
                  ? "border-brand-600 bg-brand-50 dark:bg-brand-950/60"
                  : "border-line hover:bg-surface-muted",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-medium",
                  mode === option.key
                    ? "text-brand-700 dark:text-brand-200"
                    : "text-foreground",
                )}
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs text-foreground-muted">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <Field
        label="Your text"
        htmlFor="text"
        hint={
          maxWords ? `Up to ${formatNumber(maxWords)} words on your plan.` : undefined
        }
      >
        <Textarea
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={file !== null || isPending}
          rows={10}
          className="min-h-48"
          placeholder="Paste the text you want to improve…"
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
                onClick={clearFile}
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
            isPending && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="size-4" aria-hidden="true" />
          {file ? "Choose another file" : "Upload a document"}
          <input
            ref={fileInputRef}
            type="file"
            name="file"
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
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. Your original is kept
        alongside the rewrite, and we check that every figure, citation and
        quotation survived.
      </p>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending} disabled={!ready}>
          {isPending ? "Improving…" : `Improve writing (${creditCost} credits)`}
        </Button>
        <p className="text-xs text-foreground-muted">
          Credits are only charged when it succeeds.
        </p>
      </div>
    </form>
  );
}
