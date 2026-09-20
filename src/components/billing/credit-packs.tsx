"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { formatNumber } from "@/lib/utils/format";
import { startPackCheckoutAction } from "@/lib/billing/actions";
import type { PublicPack } from "@/lib/billing/queries";

/**
 * One-off credit packs.
 *
 * Purchased credits do not expire at the period rollover — the ledger keeps
 * them separate from the plan allowance for exactly that reason — so the copy
 * says so where someone is deciding whether to buy.
 */
export function CreditPacks({
  packs,
  paymentsConfigured,
}: {
  packs: PublicPack[];
  paymentsConfigured: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buy(packKey: string) {
    setError(null);
    setPendingKey(packKey);

    startTransition(async () => {
      const result = await startPackCheckoutAction({ packKey });
      setPendingKey(null);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      window.location.href = result.data.url;
    });
  }

  if (packs.length === 0) return null;

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {packs.map((pack) => {
          const purchasable = paymentsConfigured && Boolean(pack.provider_price_id);

          return (
            <Card key={pack.id} className="flex flex-col p-4">
              <p className="text-sm font-medium">{pack.name}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber(pack.credits)}
                <span className="text-sm font-normal text-foreground-subtle">
                  {" "}
                  credits
                </span>
              </p>
              <p className="mt-0.5 text-sm text-foreground-muted">
                {new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: pack.currency,
                  maximumFractionDigits: pack.price_cents % 100 === 0 ? 0 : 2,
                }).format(pack.price_cents / 100)}
              </p>

              <div className="mt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  loading={isPending && pendingKey === pack.key}
                  disabled={isPending || !purchasable}
                  onClick={() => buy(pack.key)}
                >
                  {purchasable ? "Buy credits" : "Not available yet"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-foreground-subtle">
        Purchased credits never expire, and are spent only after your monthly
        allowance has run out.
      </p>
    </div>
  );
}
