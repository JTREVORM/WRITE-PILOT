"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/utils/result";

/** Inline "resend" control for the unconfirmed-email setup item. */
export function ResendVerification() {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(() => resendVerificationAction(), null);

  if (state?.ok) {
    return (
      <p className="text-xs font-medium text-success-600" role="status">
        Sent — check your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" size="sm" variant="outline" loading={isPending}>
        Resend email
      </Button>
      {state && !state.ok ? (
        <span className="text-xs text-danger-600" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
