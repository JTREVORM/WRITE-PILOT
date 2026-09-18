import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/config/routes";
import { formatNumber } from "@/lib/utils/format";
import { getEntitlementsSafe } from "@/lib/entitlements/service";

/**
 * Credit summary for the shell.
 *
 * Fetches its own data so it can sit behind a Suspense boundary: the navigation
 * paints immediately and the meter fills in when the entitlement read resolves,
 * rather than the whole shell waiting on it.
 *
 * Shows credits *remaining* rather than credits used — the number a user needs
 * before starting a task is how much they have left.
 */
export async function CreditMeter({ userId }: { userId: string }) {
  const entitlements = await getEntitlementsSafe(userId);
  const { credits, plan } = entitlements;

  const allowance = credits.monthlyAllowance || plan?.monthlyCredits || 0;
  const used = Math.max(0, allowance - credits.allowanceBalance);

  return (
    <div className="rounded-card border border-line bg-surface-muted/60 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground-muted">
          Credits remaining
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatNumber(credits.balance)}
        </span>
      </div>

      {allowance > 0 ? (
        <Progress
          className="mt-2.5"
          value={used}
          max={allowance}
          tone="auto"
          label={`${used} of ${allowance} monthly credits used`}
        />
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
        <span className="text-foreground-subtle">
          {plan ? `${plan.name} plan` : "No active plan"}
          {credits.purchasedBalance > 0
            ? ` · +${formatNumber(credits.purchasedBalance)} bought`
            : ""}
        </span>
        <Link
          href={routes.usage}
          className="font-medium text-brand-600 hover:underline"
        >
          Details
        </Link>
      </div>
    </div>
  );
}

/** Fallback with the same footprint, so nothing shifts when the meter arrives. */
export function CreditMeterFallback() {
  return (
    <div className="rounded-card border border-line bg-surface-muted/60 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3.5 w-8" />
      </div>
      <Skeleton className="mt-3 h-1.5 w-full" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}
