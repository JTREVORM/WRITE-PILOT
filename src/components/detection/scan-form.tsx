"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { runScanAction } from "@/lib/detection/actions";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import { MIN_WORDS_FOR_DETECTION } from "@/lib/detection/scoring";
import type { ActionResult } from "@/lib/utils/result";

/**
 * The scan input.
 *
 * Two modes, one submission: paste text, or attach a document. The live word
 * count and the cost are both shown before submitting, because a user should
 * know what a run will cost them before it is charged — not after.
 */
export function ScanForm({
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
  >(runScanAction, null);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = file ? null : countWords(text);
  const tooShort = wordCount !== null && wordCount > 0 && wordCount < MIN_WORDS_FOR_DETECTION;
  const tooLong = wordCount !== null && maxWords !== null && wordCount > maxWords;
  const canAfford = balance >= creditCost;

  const ready =
    !isPending &&
    canAfford &&
    (file !== null || (wordCount !== null && wordCount >= MIN_WORDS_FOR_DETECTION)) &&
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
          This check costs {creditCost} credits and you have {formatNumber(balance)}.
          Your allowance refreshes at the start of your next billing period.
        </Alert>
      ) : null}

      <Field
        label="Text to analyse"
        htmlFor="text"
        hint={
          maxWords
            ? `Up to ${formatNumber(maxWords)} words on your plan. Minimum ${MIN_WORDS_FOR_DETECTION} words.`
            : `Minimum ${MIN_WORDS_FOR_DETECTION} words.`
        }
      >
        <Textarea
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={file !== null || isPending}
          rows={12}
          className="min-h-56 font-normal"
          placeholder="Paste the text you want to check…"
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
              {tooShort ? ` — ${MIN_WORDS_FOR_DETECTION} needed` : ""}
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
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. Scanned images have no text
        layer and cannot be read.
      </p>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending} disabled={!ready}>
          {isPending ? "Analysing…" : `Check for AI (${creditCost} credits)`}
        </Button>
        <p className="text-xs text-foreground-muted">
          Credits are only charged when the analysis succeeds.
        </p>
      </div>
    </form>
  );
}
