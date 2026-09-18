import { Activity, CalendarClock, Coins, CreditCard } from "lucide-react";

import { StatCard } from "./stat-card";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import {
  formatDate,
  formatNumber,
  formatRelativeTime,
} from "@/lib/utils/format";

/**
 * The four figures a user checks first: what they have left, what they are on,
 * how much they have done, and when it refreshes.
 */
export async function AccountSummary({ userId }: { userId: string }) {
  const entitlements = await getEntitlementsSafe(userId);
  const { credits, plan, subscription } = entitlements;

  const allowance = credits.monthlyAllowance || plan?.monthlyCredits || 0;
  const usedThisPeriod = Math.max(0, allowance - credits.allowanceBalance);

  const runsThisPeriod = Object.values(entitlements.features).reduce(
    (total, feature) => total + feature.usedThisPeriod,
    0,
  );

  return (
    <section
      aria-label="Account summary"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        label="Credits remaining"
        value={formatNumber(credits.balance)}
        icon={Coins}
        progress={allowance > 0 ? { value: usedThisPeriod, max: allowance } : undefined}
        hint={
          allowance > 0
            ? `${formatNumber(usedThisPeriod)} of ${formatNumber(allowance)} monthly credits used`
            : "No monthly allowance on this plan"
        }
      />

      <StatCard
        label="Current plan"
        value={plan?.name ?? "None"}
        icon={CreditCard}
        hint={
          subscription?.cancelAtPeriodEnd
            ? `Ends ${formatDate(subscription.currentPeriodEnd)}`
            : subscription?.currentPeriodEnd
              ? `Renews ${formatDate(subscription.currentPeriodEnd)}`
              : undefined
        }
      />

      <StatCard
        label="Runs this month"
        value={formatNumber(runsThisPeriod)}
        icon={Activity}
        hint="Across every tool"
      />

      <StatCard
        label="Credits reset"
        value={
          credits.periodEnd
            ? formatRelativeTime(credits.periodEnd).replace(/^in /, "")
            : "—"
        }
        icon={CalendarClock}
        hint={credits.periodEnd ? formatDate(credits.periodEnd) : "No period set"}
      />
    </section>
  );
}
