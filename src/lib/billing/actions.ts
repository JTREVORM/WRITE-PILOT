"use server";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import {
  createBillingPortalSession,
  createPackCheckout,
  createPlanCheckout,
} from "./service";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { toAppError } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import type { BillingIntervalValue } from "./status";

/**
 * Starting a purchase, or opening the provider's billing portal.
 *
 * Each returns a URL for the browser to follow rather than redirecting: the
 * caller can then show an error in place if something is misconfigured,
 * instead of navigating the user away to find out.
 *
 * None of these grants anything. What a user is entitled to changes when the
 * provider says so over a signed webhook, and never because a browser reached
 * a success URL.
 */

export async function startPlanCheckoutAction(params: {
  planKey: string;
  interval: BillingIntervalValue;
}): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser(routes.pricing);

  try {
    const profile = await getCurrentProfile();

    const { url } = await createPlanCheckout({
      userId: user.id,
      email: profile?.email ?? user.email ?? "",
      fullName: profile?.full_name ?? null,
      planKey: params.planKey,
      interval: params.interval === "year" ? "year" : "month",
    });

    return ok({ url });
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

export async function startPackCheckoutAction(params: {
  packKey: string;
}): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser(routes.billing);

  try {
    const profile = await getCurrentProfile();

    const { url } = await createPackCheckout({
      userId: user.id,
      email: profile?.email ?? user.email ?? "",
      fullName: profile?.full_name ?? null,
      packKey: params.packKey,
    });

    return ok({ url });
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}

export async function openBillingPortalAction(): Promise<
  ActionResult<{ url: string }>
> {
  const user = await requireUser(routes.billing);

  try {
    const { url } = await createBillingPortalSession({ userId: user.id });
    return ok({ url });
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}
