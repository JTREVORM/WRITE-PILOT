import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getRecentActivity } from "@/lib/usage/service";
import { getEntitlementsSafe } from "@/lib/entitlements/service";
import { routes } from "@/lib/config/routes";
import { formatNumber, formatRelativeTime } from "@/lib/utils/format";

/**
 * The last few operations on the account.
 *
 * Shows failures and blocked attempts as well as successes: a user who was
 * charged nothing because a run failed should be able to see that happened,
 * rather than wondering where their credits went.
 */
export async function RecentActivity({ userId }: { userId: string }) {
  const [activity, entitlements] = await Promise.all([
    getRecentActivity(userId, 6),
    getEntitlementsSafe(userId),
  ]);

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle as="h2">Recent activity</CardTitle>
        <Link
          href={routes.usage}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {activity.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nothing here yet"
            description="Once you run your first check, it'll show up here with what it cost and how long it took."
          />
        ) : (
          <ul className="divide-y divide-line">
            {activity.map((entry) => {
              const feature = entitlements.features[entry.feature_key];

              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {feature?.name ?? entry.feature_key}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {formatRelativeTime(entry.created_at)}
                      {entry.words_processed > 0
                        ? ` · ${formatNumber(entry.words_processed)} words`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {entry.status !== "success" ? (
                      <Badge
                        tone={entry.status === "failure" ? "danger" : "warning"}
                      >
                        {entry.status === "failure" ? "Failed" : "Blocked"}
                      </Badge>
                    ) : null}
                    <span className="text-xs tabular-nums text-foreground-muted">
                      {entry.credits_charged > 0 ? `−${entry.credits_charged}` : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
