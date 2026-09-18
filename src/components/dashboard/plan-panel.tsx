import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { routes } from "@/lib/config/routes";
import { formatNumber } from "@/lib/utils/format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** The limits that actually shape what a user can do, in one place. */
export async function PlanPanel({ userId }: { userId: string }) {
  const { plan } = await getEntitlementsSafe(userId);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle as="h2">Your plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Plan" value={plan?.name ?? "None"} />
        <Row
          label="Monthly credits"
          value={formatNumber(plan?.monthlyCredits ?? 0)}
        />
        <Row
          label="Words per run"
          value={
            plan?.maxWordsPerRequest
              ? formatNumber(plan.maxWordsPerRequest)
              : "Unlimited"
          }
        />
        <Row
          label="Documents"
          value={
            plan?.maxDocuments === null || plan?.maxDocuments === undefined
              ? "Unlimited"
              : formatNumber(plan.maxDocuments)
          }
        />
        <Row label="Upload size" value={plan ? `${plan.maxFileSizeMb} MB` : "—"} />

        <Link
          href={routes.usage}
          className="mt-2 block text-sm font-medium text-brand-600 hover:underline"
        >
          See usage and credit history
        </Link>
      </CardContent>
    </Card>
  );
}
