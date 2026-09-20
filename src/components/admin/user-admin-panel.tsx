"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  adjustCreditsAction,
  setPlanAction,
  setRoleAction,
} from "@/lib/admin/actions";
import type { AppRole } from "@/types/database";

/**
 * The three things an administrator can change about an account.
 *
 * Each requires a reason, and each writes an audit row in the same transaction
 * as the change. The reason field is not a formality: an adjustment nobody can
 * explain six months later is indistinguishable from an unauthorised one.
 *
 * The buttons are a convenience, not the protection. Every action re-checks the
 * admin role in the database, so a user who reached this markup another way
 * still cannot do any of it.
 */
export function UserAdminPanel({
  userId,
  currentPlanKey,
  planOptions,
  roles,
}: {
  userId: string;
  currentPlanKey: string | null;
  planOptions: Array<{ key: string; name: string }>;
  roles: AppRole[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setError(null);
    setDone(null);

    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "That didn't go through.");
        return;
      }
      setDone(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" live>
          {done}
        </Alert>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          run(
            () =>
              adjustCreditsAction({
                userId,
                credits: Number(data.get("credits")),
                reason: (data.get("reason") ?? "").toString(),
              }),
            "Credits adjusted.",
          );
        }}
      >
        <h3 className="text-sm font-semibold">Adjust credits</h3>

        <div className="flex flex-wrap gap-2">
          <Field label="Credits" htmlFor="credits" className="w-32">
            <Input
              id="credits"
              name="credits"
              type="number"
              step="1"
              placeholder="250"
              required
              disabled={isPending}
            />
          </Field>

          <Field label="Reason" htmlFor="credit-reason" className="min-w-56 flex-1">
            <Input
              id="credit-reason"
              name="reason"
              placeholder="Goodwill after an outage"
              required
              disabled={isPending}
            />
          </Field>
        </div>

        <p className="text-xs text-foreground-subtle">
          A negative number deducts. Either way it is recorded in the ledger and
          the audit log.
        </p>

        <Button type="submit" size="sm" loading={isPending}>
          Apply adjustment
        </Button>
      </form>

      <form
        className="space-y-3 border-t border-line pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          run(
            () =>
              setPlanAction({
                userId,
                planKey: (data.get("planKey") ?? "").toString(),
                reason: (data.get("reason") ?? "").toString(),
              }),
            "Plan changed.",
          );
        }}
      >
        <h3 className="text-sm font-semibold">Change plan</h3>

        <div className="flex flex-wrap gap-2">
          <Field label="Plan" htmlFor="planKey" className="w-44">
            <Select
              id="planKey"
              name="planKey"
              defaultValue={currentPlanKey ?? "free"}
              disabled={isPending}
            >
              {planOptions.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason" htmlFor="plan-reason" className="min-w-56 flex-1">
            <Input
              id="plan-reason"
              name="reason"
              placeholder="Support request #41"
              disabled={isPending}
            />
          </Field>
        </div>

        <p className="text-xs text-foreground-subtle">
          This assigns the plan directly and grants its allowance. It does not
          change anything at the payment provider.
        </p>

        <Button type="submit" size="sm" variant="secondary" loading={isPending}>
          Set plan
        </Button>
      </form>

      <div className="space-y-3 border-t border-line pt-5">
        <h3 className="text-sm font-semibold">Roles</h3>

        <div className="flex flex-wrap gap-2">
          {(["educator", "admin"] as AppRole[]).map((role) => {
            const held = roles.includes(role);

            return (
              <Button
                key={role}
                size="sm"
                variant={held ? "ghost" : "secondary"}
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      setRoleAction({
                        userId,
                        role,
                        grant: !held,
                        reason: held ? "Revoked by admin" : "Granted by admin",
                      }),
                    held ? `${role} revoked.` : `${role} granted.`,
                  )
                }
              >
                {held ? `Revoke ${role}` : `Grant ${role}`}
              </Button>
            );
          })}
        </div>

        <p className="text-xs text-foreground-subtle">
          An administrator cannot remove their own admin role — the database
          refuses it, so an installation cannot lose its last administrator by
          accident.
        </p>
      </div>
    </div>
  );
}
