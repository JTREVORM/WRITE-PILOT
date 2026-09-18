import type { Metadata } from "next";
import { Coins, Receipt } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/entitlements/service";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { CreditTransactionType } from "@/types/database";

export const metadata: Metadata = {
  title: "Usage & credits",
  robots: { index: false, follow: false },
};

const TRANSACTION_LABELS: Record<CreditTransactionType, string> = {
  signup_grant: "Welcome credits",
  plan_grant: "Plan allowance",
  purchase: "Credit purchase",
  consumption: "Used",
  refund: "Refunded",
  expiry: "Expired",
  admin_adjustment: "Adjustment",
};

export default async function UsagePage() {
  const user = await requireUser(routes.usage);
  const entitlements = await getEntitlements(user.id);

  // Read through the user's own client: Row Level Security scopes this to the
  // caller, so there is no user_id filter to get wrong.
  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from("credit_transactions")
    .select("id, type, amount, balance_after, feature_key, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const { credits, plan } = entitlements;
  const allowance = credits.monthlyAllowance || plan?.monthlyCredits || 0;
  const used = Math.max(0, allowance - credits.allowanceBalance);

  const features = Object.values(entitlements.features)
    .filter((feature) => feature.enabled || feature.usedThisPeriod > 0)
    .sort((a, b) => b.usedThisPeriod - a.usedThisPeriod || a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usage & credits</h1>
        <p className="text-sm text-foreground-muted">
          What you&apos;ve used this period, and every credit movement on your
          account.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Credits remaining"
          value={formatNumber(credits.balance)}
          icon={Coins}
          progress={allowance > 0 ? { value: used, max: allowance } : undefined}
          hint={
            credits.purchasedBalance > 0
              ? `Includes ${formatNumber(credits.purchasedBalance)} purchased credits, which don't expire`
              : undefined
          }
        />
        <StatCard
          label="Used this period"
          value={formatNumber(used)}
          hint={
            credits.periodEnd
              ? `Resets on ${formatDate(credits.periodEnd)}`
              : undefined
          }
        />
        <StatCard
          label="Used all time"
          value={formatNumber(credits.lifetimeConsumed)}
          hint={plan ? `On the ${plan.name} plan` : undefined}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2">This period by tool</CardTitle>
          <CardDescription>
            Monthly limits are set by your plan. Tools without a limit are bounded
            only by your credit balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {features.length === 0 ? (
            <EmptyState
              title="No tools available"
              description="Your plan doesn't currently include any tools."
            />
          ) : (
            <ul className="divide-y divide-line">
              {features.map((feature) => (
                <li key={feature.key} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{feature.name}</span>
                      {!feature.enabled ? (
                        <Badge tone="outline">Not in your plan</Badge>
                      ) : null}
                    </div>
                    <span className="text-xs tabular-nums text-foreground-muted">
                      {feature.monthlyLimit === null
                        ? `${formatNumber(feature.usedThisPeriod)} used · ${feature.creditCost} credits each`
                        : `${formatNumber(feature.usedThisPeriod)} of ${formatNumber(feature.monthlyLimit)} used`}
                    </span>
                  </div>

                  {feature.monthlyLimit !== null ? (
                    <Progress
                      className="mt-2.5"
                      value={feature.usedThisPeriod}
                      max={feature.monthlyLimit}
                      tone="auto"
                      label={`${feature.name} usage`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Credit history</CardTitle>
          <CardDescription>
            Every credit added to or taken from your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!transactions || transactions.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No credit activity yet"
              description="Grants, purchases and usage will all be listed here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Credit transaction history</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-foreground-subtle">
                    <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                      Date
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Description
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      Change
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-foreground-muted sm:px-6">
                        {formatDate(transaction.created_at, {
                          dateStyle: "medium",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-medium">
                          {TRANSACTION_LABELS[transaction.type] ?? transaction.type}
                        </span>
                        {transaction.reason ? (
                          <span className="block text-xs text-foreground-muted">
                            {transaction.reason}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-3 text-right tabular-nums ${
                          transaction.amount > 0
                            ? "text-success-600"
                            : "text-foreground-muted"
                        }`}
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {formatNumber(transaction.amount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums sm:px-6">
                        {formatNumber(transaction.balance_after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
