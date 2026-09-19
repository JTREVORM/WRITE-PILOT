"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { checkCitationsAction } from "@/lib/citations/actions";
import { CITATION_STYLES } from "@/lib/citations/styles";
import { MIN_WORDS_FOR_CITATIONS } from "@/lib/citations/constants";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import {
  SelectedDocument,
  type SelectedToolDocument,
} from "@/components/documents/selected-document";
import { routes } from "@/lib/config/routes";
import type { ActionResult } from "@/lib/utils/result";
import type { CitationStyleValue } from "@/types/database";

/**
 * The submission form.
 *
 * The style is picked as cards rather than a dropdown because the choice is the
 * one thing that changes what "correct" means here, and each style carries its
 * in-text form with it — a user who is unsure which one their department uses
 * can recognise the shape they have been writing.
 *
 * The whole document is wanted, reference list included. The gating mirrors the
 * server's rules so the button is never enabled on input the server will refuse.
 */
export function CheckForm({
  creditCost,
  maxWords,
  maxFileSizeMb,
  balance,
  defaultStyle = "apa7",
  document = null,
}: {
  creditCost: number;
  maxWords: number | null;
  maxFileSizeMb: number;
  balance: number;
  defaultStyle?: CitationStyleValue;
  /** Set when the tool was opened from the library. */
  document?: SelectedToolDocument | null;
}) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(checkCitationsAction, null);

  const [text, setText] = useState("");
  const [style, setStyle] = useState<CitationStyleValue>(defaultStyle);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = file ? null : countWords(text);
  const tooShort =
    wordCount !== null && wordCount > 0 && wordCount < MIN_WORDS_FOR_CITATIONS;
  // A chosen document wins on the server, so the gating follows its length.
  const activeWords = document ? document.wordCount : wordCount;
  const tooLong = activeWords !== null && maxWords !== null && activeWords > maxWords;
  const canAfford = balance >= creditCost;

  const ready =
    !isPending &&
    canAfford &&
    (document !== null ||
      file !== null ||
      (wordCount !== null && wordCount >= MIN_WORDS_FOR_CITATIONS)) &&
    !tooLong;

  return (
    <form action={formAction} className="space-y-5">
      {document ? (
        <SelectedDocument document={document} toolHref={routes.citations} />
      ) : null}

      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {!canAfford ? (
        <Alert tone="warning">
          A citation check costs {creditCost} credits and you have{" "}
          {formatNumber(balance)}.
        </Alert>
      ) : null}

      <input type="hidden" name="style" value={style} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Check against</legend>
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Citation style"
        >
          {CITATION_STYLES.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={style === option.key}
              disabled={isPending}
              onClick={() => setStyle(option.key)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                style === option.key
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "border-line hover:bg-surface-muted",
              )}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs text-foreground-muted">
                {option.description}
              </span>
              <span className="mt-1.5 block font-mono text-[11px] text-foreground-subtle">
                {option.inTextExample}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <Field
        label="Your document"
        htmlFor="documentText"
        hint={
          maxWords
            ? `Include your reference list. Up to ${formatNumber(maxWords)} words on your plan.`
            : "Include your reference list — it is half of what gets checked."
        }
      >
        <Textarea
          id="documentText"
          name="documentText"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={document !== null || file !== null || isPending}
          rows={12}
          className="min-h-56"
          placeholder="Paste your full document, including the reference list…"
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
              {tooShort ? ` — ${MIN_WORDS_FOR_CITATIONS} needed` : ""}
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
          {file ? "Choose another file" : "Upload document"}
          <input
            ref={fileInputRef}
            type="file"
            name="documentFile"
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
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. This checks how your
        citations are written — it cannot confirm that a source exists or that it
        says what you say it does.
      </p>

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending} disabled={!ready}>
          {isPending ? "Checking…" : `Check citations (${creditCost} credits)`}
        </Button>
        <p className="text-xs text-foreground-muted">
          Credits are only charged when it succeeds.
        </p>
      </div>
    </form>
  );
}
