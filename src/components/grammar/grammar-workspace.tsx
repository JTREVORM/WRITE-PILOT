"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Check, Copy, RotateCcw, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { applySuggestions, buildRuns, countByStatus } from "@/lib/grammar/apply";
import {
  setAllSuggestionsStatusAction,
  setSuggestionStatusAction,
} from "@/lib/grammar/actions";
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  SEVERITY_STYLES,
} from "./suggestion-meta";
import type {
  GrammarSuggestionRow,
  SuggestionSeverity,
  SuggestionStatus,
} from "@/types/database";

/**
 * The interactive grammar workspace.
 *
 * The point of this screen is that it is *worked*, not read: accept, reject and
 * undo each act immediately and are persisted in the background. Optimistic
 * state carries the interaction so a decision never waits on a round trip, and
 * the server revalidation reconciles it.
 *
 * The corrected text is derived from the accepted suggestions on every render
 * rather than stored, which is what makes undo exact — rejecting everything
 * returns the original characters.
 */

type OptimisticUpdate =
  | { kind: "one"; id: string; status: SuggestionStatus }
  | { kind: "all"; status: SuggestionStatus; from?: SuggestionStatus };

export function GrammarWorkspace({
  checkId,
  content,
  suggestions,
}: {
  checkId: string;
  content: string;
  suggestions: GrammarSuggestionRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SuggestionSeverity | "all">(
    "all",
  );

  const [optimistic, applyOptimistic] = useOptimistic(
    suggestions,
    (state, update: OptimisticUpdate) =>
      state.map((suggestion) => {
        if (update.kind === "one") {
          return suggestion.id === update.id
            ? { ...suggestion, status: update.status }
            : suggestion;
        }
        if (update.from && suggestion.status !== update.from) return suggestion;
        return { ...suggestion, status: update.status };
      }),
  );

  const counts = useMemo(() => countByStatus(optimistic), [optimistic]);

  const corrected = useMemo(
    () =>
      applySuggestions(
        content,
        optimistic.map((suggestion) => ({
          startOffset: suggestion.start_offset,
          endOffset: suggestion.end_offset,
          suggestedText: suggestion.suggested_text,
          status: suggestion.status,
        })),
      ),
    [content, optimistic],
  );

  // Resolved suggestions stop being marked in the document — the point of
  // accepting one is that it is dealt with.
  const runs = useMemo(
    () =>
      buildRuns(
        content,
        optimistic
          .filter((suggestion) => suggestion.status === "pending")
          .map((suggestion) => ({
            ...suggestion,
            startOffset: suggestion.start_offset,
            endOffset: suggestion.end_offset,
          })),
      ),
    [content, optimistic],
  );

  const visible = optimistic.filter(
    (suggestion) =>
      severityFilter === "all" || suggestion.severity === severityFilter,
  );

  function setOne(id: string, status: SuggestionStatus) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ kind: "one", id, status });
      const result = await setSuggestionStatusAction({
        checkId,
        suggestionId: id,
        status,
      });
      // The optimistic state is discarded when the transition ends, so a
      // failure reverts to the server's view on its own; this just explains it.
      if (!result.ok) setError(result.error);
    });
  }

  function setAll(status: SuggestionStatus, from?: SuggestionStatus) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ kind: "all", status, from });
      const result = await setAllSuggestionsStatusAction({ checkId, status, from });
      if (!result.ok) setError(result.error);
    });
  }

  async function copyCorrected() {
    try {
      await navigator.clipboard.writeText(corrected);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it manually.");
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3">
        <span className="mr-auto text-sm text-foreground-muted">
          <span className="font-medium text-foreground">{counts.pending}</span>{" "}
          open ·{" "}
          <span className="font-medium text-success-700 dark:text-success-500">
            {counts.accepted}
          </span>{" "}
          accepted ·{" "}
          <span className="font-medium">{counts.rejected}</span> dismissed
        </span>

        <Button
          size="sm"
          variant="outline"
          disabled={isPending || counts.pending === 0}
          onClick={() => setAll("accepted", "pending")}
        >
          <Check className="size-4" aria-hidden="true" />
          Accept all open
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending || counts.total === counts.pending}
          onClick={() => setAll("pending")}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Undo all
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Document with inline marks */}
        <Card className="lg:col-span-3">
          <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                {counts.accepted > 0 ? "Your text, with accepted edits" : "Your text"}
              </h2>
              <Button size="sm" variant="ghost" onClick={copyCorrected}>
                <Copy className="size-4" aria-hidden="true" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <p className="whitespace-pre-wrap text-sm leading-7">
              {counts.accepted > 0
                ? corrected
                : runs.map((run, index) =>
                    run.suggestion ? (
                      <mark
                        key={index}
                        className={cn(
                          "rounded-sm bg-transparent px-0.5 underline decoration-2 underline-offset-4",
                          SEVERITY_STYLES[run.suggestion.severity].mark,
                        )}
                        title={`${SEVERITY_LABELS[run.suggestion.severity]}: ${
                          run.suggestion.explanation ?? ""
                        }`}
                      >
                        {run.text}
                      </mark>
                    ) : (
                      <span key={index}>{run.text}</span>
                    ),
                  )}
            </p>

            {counts.accepted > 0 ? (
              <p className="mt-4 border-t border-line pt-3 text-xs text-foreground-subtle">
                Showing your text with {counts.accepted} accepted{" "}
                {counts.accepted === 1 ? "edit" : "edits"} applied. Undo any
                suggestion to see the original again.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Suggestion list */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={severityFilter === "all"}
              onClick={() => setSeverityFilter("all")}
            >
              All {counts.total}
            </FilterChip>
            {SEVERITY_ORDER.map((severity) => {
              const total = optimistic.filter((s) => s.severity === severity).length;
              if (total === 0) return null;

              return (
                <FilterChip
                  key={severity}
                  active={severityFilter === severity}
                  onClick={() => setSeverityFilter(severity)}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      SEVERITY_STYLES[severity].dot,
                    )}
                    aria-hidden="true"
                  />
                  {SEVERITY_LABELS[severity]} {total}
                </FilterChip>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                title={
                  counts.total === 0
                    ? "Nothing to change"
                    : "Nothing in this category"
                }
                description={
                  counts.total === 0
                    ? "We didn't find anything worth correcting in this text."
                    : "Try another filter."
                }
              />
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  disabled={isPending}
                  onAccept={() => setOne(suggestion.id, "accepted")}
                  onReject={() => setOne(suggestion.id, "rejected")}
                  onUndo={() => setOne(suggestion.id, "pending")}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
          : "border-line text-foreground-muted hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

function SuggestionCard({
  suggestion,
  disabled,
  onAccept,
  onReject,
  onUndo,
}: {
  suggestion: GrammarSuggestionRow;
  disabled: boolean;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const style = SEVERITY_STYLES[suggestion.severity];
  const resolved = suggestion.status !== "pending";

  return (
    <li>
      <Card className={cn("p-4", resolved && "opacity-60")}>
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden="true" />
          <span className={cn("text-xs font-medium", style.text)}>
            {SEVERITY_LABELS[suggestion.severity]}
          </span>
          <span className="text-xs text-foreground-subtle">
            {CATEGORY_LABELS[suggestion.category]}
          </span>

          {suggestion.status === "accepted" ? (
            <span className="ml-auto text-xs font-medium text-success-700 dark:text-success-500">
              Accepted
            </span>
          ) : suggestion.status === "rejected" ? (
            <span className="ml-auto text-xs font-medium text-foreground-subtle">
              Dismissed
            </span>
          ) : null}
        </div>

        <p className="mt-2.5 text-sm leading-relaxed">
          <span className="rounded bg-danger-50 px-1 line-through decoration-danger-500/60 dark:bg-danger-700/20">
            {suggestion.original_text}
          </span>{" "}
          <span aria-hidden="true" className="text-foreground-subtle">
            →
          </span>{" "}
          <span className="rounded bg-success-50 px-1 font-medium dark:bg-success-700/20">
            {suggestion.suggested_text || <em className="not-italic text-foreground-muted">(remove)</em>}
          </span>
        </p>

        {suggestion.explanation ? (
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            {suggestion.explanation}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          {resolved ? (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={onUndo}>
              <Undo2 className="size-3.5" aria-hidden="true" />
              Undo
            </Button>
          ) : (
            <>
              <Button size="sm" disabled={disabled} onClick={onAccept}>
                <Check className="size-3.5" aria-hidden="true" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={onReject}
              >
                <X className="size-3.5" aria-hidden="true" />
                Dismiss
              </Button>
            </>
          )}
        </div>
      </Card>
    </li>
  );
}
