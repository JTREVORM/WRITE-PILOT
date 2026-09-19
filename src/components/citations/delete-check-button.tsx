"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteCitationCheckAction } from "@/lib/citations/actions";
import { routes } from "@/lib/config/routes";

/** Deletes a check and the document stored with it. Confirms first. */
export function DeleteCitationCheckButton({ checkId }: { checkId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      const result = await deleteCitationCheckAction(checkId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(routes.citations);
    });
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-muted">
          Delete this check and its text?
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
