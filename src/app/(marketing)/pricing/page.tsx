import type { Metadata } from "next";

import { PlanGrid } from "@/components/billing/plan-grid";
import { getCurrentUser } from "@/lib/auth/session";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { listPublicPlans } from "@/lib/billing/queries";
import { isPaymentsConfigured } from "@/lib/env/server";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Plans and credits for ${siteConfig.name}. Start free.`,
};

export default async function PricingPage() {
  const [plans, user] = await Promise.all([listPublicPlans(), getCurrentUser()]);

  // Signed in: show which plan is theirs, so the page is the same page rather
  // than a second, contradictory one.
  const entitlements = user ? await getEntitlementsSafe(user.id) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay for what you use
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground-muted">
          Every plan includes every tool. What changes is how much you can run
          each month, how long a document can be, and how many you can keep.
        </p>
      </div>

      <div className="mt-10">
        <PlanGrid
          plans={plans}
          currentPlanKey={entitlements?.plan?.key ?? null}
          paymentsConfigured={isPaymentsConfigured}
          signedIn={Boolean(user)}
        />
      </div>

      <div className="mx-auto mt-14 max-w-2xl space-y-4 text-sm leading-relaxed text-foreground-muted">
        <h2 className="text-sm font-semibold text-foreground">
          How credits work
        </h2>
        <p>
          Every tool costs a set number of credits per run, and the cost is
          shown on the button before you press it. Your plan&apos;s allowance
          arrives at the start of each billing period. Credits you buy
          separately never expire, and are only spent once the allowance has run
          out.
        </p>
        <p>
          A run that fails is refunded automatically — you are charged for work
          you received, not for work that was attempted.
        </p>
      </div>
    </div>
  );
}
