"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteGradeAction, deleteRubricAction } from "@/lib/grading/actions";
import { routes } from "@/lib/config/routes";

/** Shared confirm-then-delete control for rubrics and grades. */
function ConfirmDelete({
  prompt,
  onConfirm,
}: {
  prompt: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error ?? "That didn't work. Please try again.");
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-muted">{prompt}</span>
        <Button size="sm" variant="danger" loading={isPending} onClick={remove}>
          Delete
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error ? (
        <span className="text-xs text-danger-600" role="alert">
          {error}
        </span>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Delete
      </Button>
    </span>
  );
}

export function DeleteRubricButton({ rubricId }: { rubricId: string }) {
  const router = useRouter();

  return (
    <ConfirmDelete
      prompt="Delete this rubric? Grades already produced from it are kept."
      onConfirm={async () => {
        const result = await deleteRubricAction(rubricId);
        if (result.ok) router.push(routes.grader);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
    />
  );
}

export function DeleteGradeButton({ gradeId }: { gradeId: string }) {
  const router = useRouter();

  return (
    <ConfirmDelete
      prompt="Delete this grade and the submission stored with it?"
      onConfirm={async () => {
        const result = await deleteGradeAction(gradeId);
        if (result.ok) router.push(routes.grader);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
    />
  );
}
