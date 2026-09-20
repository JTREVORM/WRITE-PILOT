"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";
import { startPlanCheckoutAction } from "@/lib/billing/actions";
import type { PublicPlan } from "@/lib/billing/queries";

/**
 * The plan catalogue.
 *
 * Prices, limits and credit allowances are rows in the database, so this
 * component renders whatever the catalogue says rather than carrying a copy of
 * it. Repricing a plan is an update, not a deploy.
 *
 * A plan with no provider price id cannot be bought, and says so, rather than
 * offering a button that fails on the provider's own page.
 */
function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function planFeatures(plan: PublicPlan): string[] {
  const features = [
    `${formatNumber(plan.monthly_credits)} credits a month`,
    plan.max_documents === null
      ? "Unlimited documents"
      : `${formatNumber(plan.max_documents)} documents`,
    plan.max_words_per_request === null
      ? "No word limit per run"
      : `${formatNumber(plan.max_words_per_request)} words per run`,
    `${plan.max_file_size_mb} MB uploads`,
  ];

  if (plan.credits_roll_over) features.push("Unused credits roll over");
  if (plan.priority_processing) features.push("Priority processing");

  return features;
}

export function PlanGrid({
  plans,
  currentPlanKey,
  paymentsConfigured,
  signedIn,
}: {
  plans: PublicPlan[];
  currentPlanKey?: string | null;
  paymentsConfigured: boolean;
  signedIn: boolean;
}) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(planKey: string) {
    setError(null);
    setPendingKey(planKey);

    startTransition(async () => {
      const result = await startPlanCheckoutAction({ planKey, interval });
      setPendingKey(null);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      window.location.href = result.data.url;
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <div
        className="flex justify-center gap-1 rounded-full border border-line p-1"
        role="radiogroup"
        aria-label="Billing interval"
      >
        {(["month", "year"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={interval === option}
            onClick={() => setInterval(option)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              interval === option
                ? "bg-brand-500 text-white"
                : "text-foreground-muted hover:bg-surface-muted",
            )}
          >
            {option === "month" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const cents =
            interval === "year" ? plan.price_yearly_cents : plan.price_monthly_cents;
          const free = cents === 0;
          const current = currentPlanKey === plan.key;
          const priceId =
            interval === "year"
              ? plan.provider_price_id_yearly
              : plan.provider_price_id_monthly;
          const purchasable = paymentsConfigured && Boolean(priceId) && !free;

          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col p-5",
                plan.is_highlighted && "border-brand-500",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                {current ? (
                  <Badge tone="brand">Your plan</Badge>
                ) : plan.is_highlighted ? (
                  <Badge tone="outline">Most chosen</Badge>
                ) : null}
              </div>

              {plan.tagline ? (
                <p className="mt-1 text-xs text-foreground-muted">{plan.tagline}</p>
              ) : null}

              <p className="mt-4">
                <span className="text-3xl font-semibold tracking-tight">
                  {free ? "Free" : formatPrice(cents, plan.currency)}
                </span>
                {!free ? (
                  <span className="text-sm text-foreground-subtle">
                    {" "}
                    / {interval === "year" ? "year" : "month"}
                  </span>
                ) : null}
              </p>

              <ul className="mt-4 flex-1 space-y-2">
                {planFeatures(plan).map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-success-600 dark:text-success-500"
                      aria-hidden="true"
                    />
                    <span className="text-foreground-muted">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {current ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : free ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Included
                  </Button>
                ) : !signedIn ? (
                  <a
                    href={`/register?next=/pricing`}
                    className="block w-full rounded-lg bg-brand-500 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brand-600"
                  >
                    Create an account
                  </a>
                ) : purchasable ? (
                  <Button
                    className="w-full"
                    loading={isPending && pendingKey === plan.key}
                    disabled={isPending}
                    onClick={() => choose(plan.key)}
                  >
                    Choose {plan.name}
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    Not available yet
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {!paymentsConfigured ? (
        <p className="text-center text-xs text-foreground-subtle">
          Payments aren&apos;t connected on this deployment, so plans can be
          compared but not bought.
        </p>
      ) : null}
    </div>
  );
}
