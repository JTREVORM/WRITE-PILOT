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
import { StatTiles, type Stat } from "@/components/admin/stat-tiles";
import { UsageChart } from "@/components/admin/usage-chart";
import { FeatureUsage } from "@/components/admin/feature-usage";
import { UserAdminPanel } from "@/components/admin/user-admin-panel";
import type { AdminOverview, UsagePoint } from "@/lib/admin/queries";
import type { ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Admin preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the admin surfaces.
 *
 * These need both an administrator and a populated database, so they are
 * otherwise invisible until a deployment has real traffic — which is a bad time
 * to discover that the chart mislabels a quiet day or that a nine-feature
 * ranking is unreadable.
 *
 * The series deliberately contains zero days and one clear peak, because those
 * are the two cases a bar chart gets wrong.
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

/** 30 days, weekends quiet, one peak, two days with nothing at all. */
const RUNS = [
  18, 24, 31, 27, 22, 4, 2, 29, 35, 41, 38, 33, 6, 3, 44, 52, 61, 48, 39, 8, 5,
  57, 63, 0, 0, 71, 58, 46, 12, 9,
];

const SERIES: UsagePoint[] = RUNS.map((runs, index) => {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - (RUNS.length - 1 - index));

  const failures = runs > 0 && index % 7 === 3 ? Math.max(1, Math.round(runs * 0.05)) : 0;

  return {
    day: day.toISOString(),
    runs,
    successes: runs - failures,
    failures,
    credits: runs * 3,
  };
});

const OVERVIEW: AdminOverview = {
  generatedAt: new Date().toISOString(),
  users: { total: 1284, new7d: 63, new30d: 241 },
  subscriptions: [
    { planKey: "free", planName: "Free", count: 1021, monthlyCents: 0 },
    { planKey: "student", planName: "Student", count: 186, monthlyCents: 599 },
    { planKey: "pro", planName: "Pro", count: 64, monthlyCents: 999 },
    { planKey: "educator", planName: "Educator", count: 13, monthlyCents: 1999 },
  ],
  credits: { outstanding: 184_320, consumed30d: 41_882, refunded30d: 613 },
  revenue: { cents30d: 214_733, payments30d: 271 },
  usage30d: [
    {
      featureKey: "grammar_check",
      featureName: "Grammar Checker",
      runs: 4820,
      successes: 4790,
      failures: 30,
      rejections: 112,
      credits: 4820,
    },
    {
      featureKey: "ai_detection",
      featureName: "AI Detector",
      runs: 3140,
      successes: 3128,
      failures: 12,
      rejections: 64,
      credits: 6280,
    },
    {
      featureKey: "naturalize",
      featureName: "Naturalize",
      runs: 1960,
      successes: 1951,
      failures: 9,
      rejections: 22,
      credits: 5880,
    },
    {
      featureKey: "citation_check",
      featureName: "Citation Checker",
      runs: 1204,
      successes: 1200,
      failures: 4,
      rejections: 18,
      credits: 2408,
    },
    {
      featureKey: "ai_grading",
      featureName: "AI Grader",
      runs: 870,
      successes: 866,
      failures: 4,
      rejections: 31,
      credits: 4350,
    },
    {
      featureKey: "deep_analysis",
      featureName: "Deep Document Analysis",
      runs: 402,
      successes: 400,
      failures: 2,
      rejections: 9,
      credits: 4020,
    },
  ],
  health: { failures24h: 3, webhookFailures: 1, webhooksUnprocessed: 0 },
};

export default function AdminPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const paid = OVERVIEW.subscriptions
    .filter((entry) => entry.monthlyCents > 0)
    .reduce((total, entry) => total + entry.count, 0);

  const stats: Stat[] = [
    { label: "Accounts", value: "1,284", note: "63 in the last 7 days" },
    {
      label: "Paying subscriptions",
      value: String(paid),
      note: "$2,147 in the last 30 days",
    },
    {
      label: "Credits consumed",
      value: "41,882",
      note: "613 refunded, 30 days",
    },
    {
      label: "Failures",
      value: "3",
      note: "AI runs that failed, last 24 hours",
      tone: "warning",
    },
  ];

  return (
    <AppShell profile={PROFILE} roles={["user", "admin"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Admin"
          description="Fixture data. Platform health and account administration."
          breadcrumbs={[{ label: "Admin" }]}
        />

        <StatTiles stats={stats} />

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle as="h2">Activity</CardTitle>
              <CardDescription>
                Every AI run, successful or not, over the last 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsageChart points={SERIES} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle as="h2">By tool</CardTitle>
              <CardDescription>Runs in the last 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <FeatureUsage usage={OVERVIEW.usage30d} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Administer</CardTitle>
            <CardDescription>
              Every change here is audited, with the reason you give.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserAdminPanel
              userId="preview"
              currentPlanKey="student"
              planOptions={[
                { key: "free", name: "Free" },
                { key: "student", name: "Student" },
                { key: "pro", name: "Pro" },
                { key: "educator", name: "Educator" },
              ]}
              roles={["user"]}
            />
          </CardContent>
        </Card>

        <p className="text-xs text-foreground-subtle">
          Administration does not include reading customers&apos; writing. These
          figures are counts; the documents, drafts and results behind them are
          readable only by the accounts that own them.
        </p>
      </div>
    </AppShell>
  );
}
