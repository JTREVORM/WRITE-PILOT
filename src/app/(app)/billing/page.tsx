import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanGrid } from "@/components/billing/plan-grid";
import { CreditPacks } from "@/components/billing/credit-packs";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { requireUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import {
  listCreditPacks,
  listPayments,
  listPublicPlans,
} from "@/lib/billing/queries";
import { isPaymentsConfigured } from "@/lib/env/server";
import { readParam } from "@/lib/documents/selection";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(routes.billing);

  const [entitlements, plans, packs, payments, params] = await Promise.all([
    getEntitlementsSafe(user.id),
    listPublicPlans(),
    listCreditPacks(),
    listPayments(),
    searchParams,
  ]);

  const justCheckedOut = readParam(params, "checkout") === "complete";
  const subscription = entitlements.subscription;
  const hasPaidPlan = Boolean(subscription && entitlements.plan?.key !== "free");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Your plan, your credits and what you have paid for."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Billing" },
        ]}
        actions={
          hasPaidPlan ? (
            <ManageBillingButton disabled={!isPaymentsConfigured} />
          ) : null
        }
      />

      {justCheckedOut ? (
        // Deliberately not "you're on Pro now": this page is reachable by
        // typing the URL, and the plan changes when the provider says so.
        <Alert tone="info" title="Thanks — we're setting that up">
          Your payment is being confirmed. This page updates as soon as it is,
          usually within a few seconds.
        </Alert>
      ) : null}

      {!isPaymentsConfigured ? (
        <Alert tone="warning" title="Payments aren't connected">
          This deployment has no payment provider configured, so plans can be
          compared but not bought. Nothing here will charge you.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Your plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {entitlements.plan?.name ?? "Free"}
            </p>
            {subscription ? (
              <p className="mt-1 text-sm text-foreground-muted">
                {subscription.cancelAtPeriodEnd
                  ? "Ends"
                  : subscription.status === "trialing"
                    ? "Trial ends"
                    : "Renews"}{" "}
                {subscription.currentPeriodEnd
                  ? formatDate(subscription.currentPeriodEnd)
                  : "—"}
              </p>
            ) : (
              <p className="mt-1 text-sm text-foreground-muted">
                No subscription — you are on the free plan.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(entitlements.credits.balance)}
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              {formatNumber(entitlements.credits.purchasedBalance)} of them
              purchased, which never expire.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Allowance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(entitlements.plan?.monthlyCredits ?? 0)}
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              Added at the start of each period.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Top up</CardTitle>
          <CardDescription>
            A one-off pack, for a month that ran long.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreditPacks packs={packs} paymentsConfigured={isPaymentsConfigured} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Change plan</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Upgrades take effect immediately; downgrades at the end of the
            period you have paid for.
          </p>
        </div>
        <PlanGrid
          plans={plans}
          currentPlanKey={entitlements.plan?.key ?? null}
          paymentsConfigured={isPaymentsConfigured}
          signedIn
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Payment history</CardTitle>
        </CardHeader>
        <CardContent className={payments.length > 0 ? "p-0" : undefined}>
          {payments.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Payments appear here as soon as they are confirmed."
            />
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {payment.description ??
                        (payment.kind === "credit_pack"
                          ? "Credit pack"
                          : "Subscription")}
                    </span>
                    <span className="block text-xs text-foreground-muted">
                      {formatDate(payment.created_at)}
                      {payment.credits_granted > 0
                        ? ` · ${formatNumber(payment.credits_granted)} credits`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatMoney(payment.amount_cents, payment.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
