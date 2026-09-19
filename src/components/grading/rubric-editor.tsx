"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { updateCriterionAction } from "@/lib/grading/actions";
import type { RubricCriterionRow } from "@/types/database";

/**
 * Correcting an extracted criterion.
 *
 * Extraction from a scanned handout or an awkward table gets things wrong, and
 * a criterion that is wrong here is wrong in every grade produced against it.
 * Letting the user fix it costs nothing and is far better than asking them to
 * re-upload and pay again.
 *
 * The database guard means only the name, description and points can move — a
 * criterion cannot be grafted onto a different rubric from here.
 */
export function RubricEditor({
  rubricId,
  criteria,
}: {
  rubricId: string;
  criteria: RubricCriterionRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(criterion: RubricCriterionRow, form: HTMLFormElement) {
    const data = new FormData(form);
    const name = (data.get("name") ?? "").toString();
    const description = (data.get("description") ?? "").toString();
    const maxPoints = Number(data.get("maxPoints"));

    setError(null);
    startTransition(async () => {
      const result = await updateCriterionAction({
        rubricId,
        criterionId: criterion.id,
        name,
        description,
        maxPoints,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <ol className="space-y-2.5">
        {criteria.map((criterion) => {
          const isEditing = editingId === criterion.id;

          return (
            <li key={criterion.id}>
              <Card className="p-4">
                {isEditing ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      save(criterion, event.currentTarget);
                    }}
                    className="space-y-3"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Input
                        name="name"
                        defaultValue={criterion.name}
                        aria-label="Criterion name"
                        className="min-w-48 flex-1"
                        required
                      />
                      <Input
                        name="maxPoints"
                        type="number"
                        min={0}
                        step="0.5"
                        defaultValue={String(criterion.max_points)}
                        aria-label="Points"
                        className="w-28"
                        required
                      />
                    </div>

                    <Textarea
                      name="description"
                      defaultValue={criterion.description ?? ""}
                      aria-label="What this criterion requires"
                      rows={2}
                      placeholder="What this criterion requires…"
                    />

                    <div className="flex items-center gap-2">
                      <Button type="submit" size="sm" loading={isPending}>
                        <Check className="size-3.5" aria-hidden="true" />
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{criterion.name}</p>
                      {criterion.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                          {criterion.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {Number(criterion.max_points)}
                        <span className="text-foreground-subtle"> pts</span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(criterion.id)}
                        aria-label={`Edit ${criterion.name}`}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
