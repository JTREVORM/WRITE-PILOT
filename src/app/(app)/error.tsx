"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the signed-in area.
 *
 * Shows what the user can do next rather than the thrown message — the detail
 * goes to the server logs, where it is useful, instead of to the browser.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <Alert tone="danger">
        We hit an unexpected problem loading this page. Nothing you were working
        on has been lost.
      </Alert>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        {error.digest ? (
          <p className="text-xs text-foreground-subtle">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
