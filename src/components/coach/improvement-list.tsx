"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Check, GraduationCap, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { bandFor } from "@/lib/coach/priority";
import {
  coachActionAction,
  setImprovementStatusAction,
} from "@/lib/coach/actions";
import {
  BAND_STYLES,
  CATEGORY_LABELS,
  ORIGIN_DESCRIPTIONS,
  ORIGIN_LABELS,
} from "./improvement-meta";
import type {
  ImprovementActionRow,
  ImprovementStatus,
} from "@/types/database";

/**
 * The list, worked rather than read.
 *
 * Order is the product: the highest-priority change is first because the server
 * scored it that way, and the list does not re-sort itself when an item is
 * ticked off — a list that reshuffles under the reader loses their place, and
 * the point is to work down it.
 *
 * Coaching is bought per improvement, so the button says the price. An
 * explanation already bought is shown without asking again.
 */
export function ImprovementList({
  analysisId,
  actions,
  coachCreditCost,
  coachAvailable,
}: {
  analysisId: string;
  actions: ImprovementActionRow[];
  coachCreditCost: number;
  coachAvailable: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [coaching, setCoaching] = useState<Record<string, string>>({});
  const [coachingId, setCoachingId] = useState<string | null>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    actions,
    (state, update: { id: string; status: ImprovementStatus }) =>
      state.map((action) =>
        action.id === update.id ? { ...action, status: update.status } : action,
      ),
  );

  const openCount = useMemo(
    () => optimistic.filter((action) => action.status === "open").length,
    [optimistic],
  );

  const visible = showDone
    ? optimistic
    : optimistic.filter((action) => action.status === "open");

  function setStatus(id: string, status: ImprovementStatus) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ id, status });
      const result = await setImprovementStatusAction({
        analysisId,
        actionId: id,
        status,
      });
      if (!result.ok) setError(result.error);
    });
  }

  function explain(id: string) {
    setError(null);
    setCoachingId(id);
    startTransition(async () => {
      const result = await coachActionAction({ analysisId, actionId: id });
      setCoachingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCoaching((current) => ({ ...current, [id]: result.data.coaching }));
    });
  }

  if (actions.length === 0) {
    return (
      <EmptyState
        title="Nothing to change"
        description="The review found no improvements worth your time on this draft."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted" aria-live="polite">
          {openCount} of {optimistic.length} still to do
        </p>

        <Button size="sm" variant="ghost" onClick={() => setShowDone(!showDone)}>
          {showDone ? "Hide finished" : "Show finished"}
        </Button>
      </div>

      <ol className="space-y-2.5">
        {visible.map((action, index) => {
          const band = bandFor(action.priority_score);
          const resolved = action.status !== "open";
          const explanation = coaching[action.id] ?? action.coaching;

          return (
            <li key={action.id}>
              <Card className={cn("p-4 sm:p-5", resolved && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums text-foreground-subtle">
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      BAND_STYLES[band.key],
                    )}
                  >
                    {band.label}
                  </span>
                  <span className="text-[11px] font-medium text-foreground-muted">
                    {CATEGORY_LABELS[action.category]}
                  </span>
                  <span
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-foreground-subtle"
                    title={ORIGIN_DESCRIPTIONS[action.origin]}
                  >
                    {ORIGIN_LABELS[action.origin]}
                  </span>
                  {resolved ? (
                    <span className="text-[11px] text-foreground-subtle">
                      {action.status === "done" ? "Done" : "Skipped"}
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-2.5 text-sm font-semibold">{action.title}</h3>

                <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">
                  {action.detail}
                </p>

                {action.location ? (
                  <p className="mt-2 text-xs text-foreground-subtle">
                    Where: {action.location}
                  </p>
                ) : null}

                <p className="mt-2 text-xs text-foreground-subtle">
                  {band.summary}
                </p>

                {explanation ? (
                  <div className="mt-3 rounded-lg bg-surface-muted p-4">
                    <p className="mb-1.5 text-[11px] font-medium text-foreground-subtle">
                      From the writing coach
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {explanation}
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {resolved ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => setStatus(action.id, "open")}
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
                        onClick={() => setStatus(action.id, "done")}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Done
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setStatus(action.id, "dismissed")}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Skip
                      </Button>
                    </>
                  )}

                  {!explanation && coachAvailable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={isPending && coachingId === action.id}
                      disabled={isPending}
                      onClick={() => explain(action.id)}
                    >
                      <GraduationCap className="size-3.5" aria-hidden="true" />
                      Explain this ({coachCreditCost} credits)
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {visible.length === 0 ? (
        <EmptyState
          title="All done"
          description="Everything on this list is finished or skipped."
        />
      ) : null}
    </div>
  );
}
