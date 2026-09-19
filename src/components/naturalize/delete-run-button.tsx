"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteNaturalizeRunAction } from "@/lib/naturalize/actions";
import { routes } from "@/lib/config/routes";

export function DeleteRunButton({ runId }: { runId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      const result = await deleteNaturalizeRunAction(runId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(routes.naturalize);
    });
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-muted">
          Delete this rewrite and both versions?
        </span>
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
