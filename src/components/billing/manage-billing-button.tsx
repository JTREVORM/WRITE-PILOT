"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openBillingPortalAction } from "@/lib/billing/actions";

/**
 * Opens the provider's billing portal.
 *
 * Cancelling, changing a card and downloading invoices happen there rather
 * than being rebuilt here: the provider is already the system of record for
 * all three, and whatever the user does comes back as a webhook and is applied
 * like any other change.
 */
export function ManageBillingButton({ disabled }: { disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await openBillingPortalAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data.url;
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {error ? (
        <span className="text-xs text-danger-600" role="alert">
          {error}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        loading={isPending}
        disabled={disabled}
        onClick={open}
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Manage billing
      </Button>
    </span>
  );
}
