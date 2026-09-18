import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";
import { quickActions } from "@/lib/config/navigation";
import { getEntitlementsSafe } from "@/lib/entitlements/service";

/**
 * The six things a user most often wants to start.
 *
 * Tools that have not shipped yet render as inert cards marked "Soon" rather
 * than links to nothing. Where a tool exists but the plan does not include it,
 * the card says so and points at the upgrade — the entitlement data is already
 * loaded for the page, so this costs nothing extra.
 */
export async function QuickActions({ userId }: { userId: string }) {
  const entitlements = await getEntitlementsSafe(userId);

  return (
    <section aria-labelledby="quick-actions-heading">
      <h2
        id="quick-actions-heading"
        className="text-sm font-semibold text-foreground"
      >
        Quick actions
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => {
          const inner = (
            <>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  action.available
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
                    : "bg-surface-muted text-foreground-subtle",
                )}
              >
                <Icon name={action.icon} className="size-4.5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {action.label}
                  </span>
                  {!action.available ? (
                    <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                      Soon
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                  {action.description}
                </span>
              </span>
            </>
          );

          if (!action.available) {
            return (
              <Card
                key={action.label}
                className="flex items-center gap-3 p-4 opacity-70"
                aria-disabled="true"
              >
                {inner}
              </Card>
            );
          }

          return (
            <Link key={action.label} href={action.href} className="rounded-card">
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-raised">
                {inner}
              </Card>
            </Link>
          );
        })}
      </div>

      {entitlements.plan ? (
        <p className="mt-3 text-xs text-foreground-subtle">
          Costs are shown before each run and only charged on success.
        </p>
      ) : null}
    </section>
  );
}
