"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Check, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { updateFindingStatusAction } from "@/lib/citations/actions";
import {
  ORIGIN_DESCRIPTIONS,
  ORIGIN_LABELS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  SEVERITY_STYLES,
  kindLabel,
} from "./finding-meta";
import type {
  CitationFindingOrigin,
  CitationFindingRow,
  CitationFindingStatus,
} from "@/types/database";

/**
 * The findings, worked rather than read.
 *
 * Each one can be marked resolved or dismissed, and the change is optimistic so
 * a decision never waits on a round trip. The column guard in the database is
 * what makes running this as the user safe: status is the only field a user
 * session can move, so ticking a finding off cannot rewrite what was found.
 *
 * The filter is by origin, not only by severity, because "show me only what was
 * actually counted" is the question a sceptical user asks first — and they are
 * entitled to an answer.
 */
export function FindingsList({
  checkId,
  findings,
}: {
  checkId: string;
  findings: CitationFindingRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<CitationFindingOrigin | "all">(
    "all",
  );

  const [optimistic, applyOptimistic] = useOptimistic(
    findings,
    (state, update: { id: string; status: CitationFindingStatus }) =>
      state.map((finding) =>
        finding.id === update.id ? { ...finding, status: update.status } : finding,
      ),
  );

  const counts = useMemo(() => {
    return {
      open: optimistic.filter((finding) => finding.status === "open").length,
      local: optimistic.filter((finding) => finding.origin === "local").length,
      model: optimistic.filter((finding) => finding.origin === "model").length,
    };
  }, [optimistic]);

  const visible = optimistic.filter(
    (finding) => originFilter === "all" || finding.origin === originFilter,
  );

  const ordered = [...visible].sort(
    (a, b) =>
      Number(a.status !== "open") - Number(b.status !== "open") ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.position - b.position,
  );

  function setStatus(id: string, status: CitationFindingStatus) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ id, status });
      const result = await updateFindingStatusAction({
        checkId,
        findingId: id,
        status,
      });
      if (!result.ok) setError(result.error);
    });
  }

  if (findings.length === 0) {
    return (
      <EmptyState
        title="Nothing to change"
        description="Every citation matches an entry in your reference list, and the entries follow the style you chose."
      />
    );
  }

  const filters: Array<{ key: CitationFindingOrigin | "all"; label: string }> = [
    { key: "all", label: `All ${optimistic.length}` },
    { key: "local", label: `${ORIGIN_LABELS.local} ${counts.local}` },
    { key: "model", label: `${ORIGIN_LABELS.model} ${counts.model}` },
  ];

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted" aria-live="polite">
          {counts.open} of {optimistic.length} still open
        </p>

        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label="Filter findings by how they were produced"
        >
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="radio"
              aria-checked={originFilter === filter.key}
              onClick={() => setOriginFilter(filter.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                originFilter === filter.key
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200"
                  : "border-line text-foreground-muted hover:bg-surface-muted",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {originFilter !== "all" ? (
        <p className="text-xs text-foreground-subtle">
          {ORIGIN_DESCRIPTIONS[originFilter]}
        </p>
      ) : null}

      <ol className="space-y-2.5">
        {ordered.map((finding) => {
          const resolved = finding.status !== "open";

          return (
            <li key={finding.id}>
              <Card className={cn("p-4", resolved && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      SEVERITY_STYLES[finding.severity],
                    )}
                  >
                    {SEVERITY_LABELS[finding.severity]}
                  </span>
                  <span className="text-[11px] font-medium text-foreground-muted">
                    {kindLabel(finding.kind)}
                  </span>
                  <span
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-foreground-subtle"
                    title={ORIGIN_DESCRIPTIONS[finding.origin]}
                  >
                    {ORIGIN_LABELS[finding.origin]}
                  </span>
                  {resolved ? (
                    <span className="text-[11px] text-foreground-subtle">
                      {finding.status === "resolved" ? "Resolved" : "Dismissed"}
                    </span>
                  ) : null}
                </div>

                {finding.target_text ? (
                  <p className="mt-2.5 text-sm font-medium break-words">
                    {finding.target_text}
                  </p>
                ) : null}

                <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">
                  {finding.message}
                </p>

                {finding.suggestion ? (
                  <p className="mt-2 rounded-lg bg-surface-muted p-3 text-sm leading-relaxed break-words">
                    {finding.suggestion}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {resolved ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => setStatus(finding.id, "open")}
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => setStatus(finding.id, "resolved")}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Fixed
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setStatus(finding.id, "dismissed")}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Not an issue
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
