"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { countWords, formatNumber } from "@/lib/utils/format";
import { addDocumentAction } from "@/lib/documents/actions";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/constants";
import type { ActionResult } from "@/lib/utils/result";

/**
 * Adding a document to the library.
 *
 * The plan's document allowance is enforced on the server; it is repeated here
 * only so a full library explains itself before the upload rather than after.
 */
export function DocumentForm({
  maxFileSizeMb,
  documentCount,
  maxDocuments,
}: {
  maxFileSizeMb: number;
  documentCount: number;
  maxDocuments: number | null;
}) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(addDocumentAction, null);

  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const full = maxDocuments !== null && documentCount >= maxDocuments;
  const wordCount = file ? null : countWords(text);
  const ready = !isPending && !full && (file !== null || text.trim().length > 0);

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok ? (
        <Alert tone="danger" live>
          {state.error}
        </Alert>
      ) : null}

      {full ? (
        <Alert tone="warning" title="Your library is full">
          Your plan keeps {maxDocuments} documents. Delete one to make room, or
          upgrade.
        </Alert>
      ) : null}

      <Field label="Name" htmlFor="title" hint="Optional — we'll use the filename.">
        <Input id="title" name="title" disabled={isPending} maxLength={200} />
      </Field>

      <Field label="Text" htmlFor="text" hint="Or upload a file below.">
        <Textarea
          id="text"
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={file !== null || isPending}
          rows={8}
          placeholder="Paste a document to keep in your library…"
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
            <span className="tabular-nums">
              {formatNumber(wordCount ?? 0)} words
            </span>
          )}
        </div>

        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted",
            (isPending || full) && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="size-4" aria-hidden="true" />
          {file ? "Choose another file" : "Upload a file"}
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept={ACCEPT_ATTRIBUTE}
            disabled={isPending || full}
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
        PDF, DOCX or TXT, up to {maxFileSizeMb} MB. Uploaded files are stored
        privately under your own account and are never public.
        {maxDocuments !== null
          ? ` ${documentCount} of ${maxDocuments} documents used.`
          : ""}
      </p>

      <div className="border-t border-line pt-5">
        <Button type="submit" size="lg" loading={isPending} disabled={!ready}>
          {isPending ? "Adding…" : "Add to library"}
        </Button>
      </div>
    </form>
  );
}
