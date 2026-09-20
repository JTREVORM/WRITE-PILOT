import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PlanGrid } from "@/components/billing/plan-grid";
import { CreditPacks } from "@/components/billing/credit-packs";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import type { PublicPack, PublicPlan } from "@/lib/billing/queries";
import type { ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Billing preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the billing surfaces.
 *
 * The catalogue lives in the database, so these screens are otherwise only
 * visible with a reachable Supabase and a signed-in session. The fixtures below
 * match the shape the queries return, including the case that matters most: a
 * plan with no provider price id, which must say it cannot be bought rather
 * than offering a button that fails on the provider's own page.
 *
 * Unreachable in production.
 */
const PROFILE: ProfileRow = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "ada@university.edu",
  full_name: "Ada Lovelace",
  avatar_url: null,
  country: "GB",
  timezone: "Europe/London",
  locale: "en",
  user_type: "researcher",
  marketing_opt_in: false,
  onboarding_completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const PLANS: PublicPlan[] = [
  {
    id: "plan-free",
    key: "free",
    name: "Free",
    tagline: "Try every tool before you pay",
    description: null,
    currency: "USD",
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    monthly_credits: 30,
    max_documents: 5,
    max_file_size_mb: 5,
    max_words_per_request: 1500,
    credits_roll_over: false,
    priority_processing: false,
    is_highlighted: false,
    provider_price_id_monthly: null,
    provider_price_id_yearly: null,
  },
  {
    id: "plan-student",
    key: "student",
    name: "Student",
    tagline: "For coursework and assignments",
    description: null,
    currency: "USD",
    price_monthly_cents: 599,
    price_yearly_cents: 5990,
    monthly_credits: 300,
    max_documents: 100,
    max_file_size_mb: 15,
    max_words_per_request: 5000,
    credits_roll_over: false,
    priority_processing: false,
    is_highlighted: true,
    provider_price_id_monthly: "price_student_month",
    provider_price_id_yearly: "price_student_year",
  },
  {
    id: "plan-pro",
    key: "pro",
    name: "Pro",
    tagline: "For researchers and professional writers",
    description: null,
    currency: "USD",
    price_monthly_cents: 999,
    price_yearly_cents: 9990,
    monthly_credits: 800,
    max_documents: null,
    max_file_size_mb: 25,
    max_words_per_request: 15000,
    credits_roll_over: true,
    priority_processing: true,
    is_highlighted: false,
    provider_price_id_monthly: "price_pro_month",
    provider_price_id_yearly: "price_pro_year",
  },
  {
    id: "plan-educator",
    key: "educator",
    name: "Educator",
    tagline: "For teaching and marking",
    description: null,
    currency: "USD",
    price_monthly_cents: 1999,
    price_yearly_cents: 19990,
    monthly_credits: 2000,
    max_documents: null,
    max_file_size_mb: 40,
    max_words_per_request: null,
    credits_roll_over: true,
    priority_processing: true,
    is_highlighted: false,
    // Deliberately unconnected: the grid must say so rather than offer it.
    provider_price_id_monthly: null,
    provider_price_id_yearly: null,
  },
];

const PACKS: PublicPack[] = [
  {
    id: "pack-10",
    key: "pack_10",
    name: "Top-up 10",
    description: "A few extra checks before a deadline.",
    credits: 10,
    price_cents: 299,
    currency: "USD",
    provider_price_id: "price_pack_10",
  },
  {
    id: "pack-30",
    key: "pack_30",
    name: "Top-up 30",
    description: "Enough for a full assignment review.",
    credits: 30,
    price_cents: 599,
    currency: "USD",
    provider_price_id: "price_pack_30",
  },
  {
    id: "pack-75",
    key: "pack_75",
    name: "Top-up 75",
    description: "Best value for a heavy writing week.",
    credits: 75,
    price_cents: 999,
    currency: "USD",
    provider_price_id: null,
  },
];

export default function BillingPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AppShell profile={PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Billing"
          description="Fixture data. Your plan, your credits and what you have paid for."
          breadcrumbs={[{ label: "Billing" }]}
          actions={<ManageBillingButton />}
        />

        <Alert tone="info" title="Thanks — we're setting that up">
          Your payment is being confirmed. This page updates as soon as it is,
          usually within a few seconds.
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Top up</CardTitle>
            <CardDescription>
              A one-off pack, for a month that ran long.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreditPacks packs={PACKS} paymentsConfigured />
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
            plans={PLANS}
            currentPlanKey="student"
            paymentsConfigured
            signedIn
          />
        </section>
      </div>
    </AppShell>
  );
}
