import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AppRole, AuditLogRow } from "@/types/database";

/**
 * Administrative reads.
 *
 * Every one of these goes through a database function that checks the admin
 * role itself, using the caller's own session. The page guard in
 * `lib/auth/guards` decides what to render; this decides what may be read, and
 * the two are independent on purpose — a mistake in the first does not become a
 * data leak.
 *
 * Nothing here can return a customer's writing. The functions do not select it,
 * and the tables it lives in have no policy that would let an administrator
 * read another account's rows even if they did.
 */

export interface AdminOverview {
  generatedAt: string;
  users: { total: number; new7d: number; new30d: number };
  subscriptions: Array<{
    planKey: string;
    planName: string;
    count: number;
    monthlyCents: number;
  }>;
  credits: { outstanding: number; consumed30d: number; refunded30d: number };
  revenue: { cents30d: number; payments30d: number };
  usage30d: Array<{
    featureKey: string;
    featureName: string;
    runs: number;
    successes: number;
    failures: number;
    rejections: number;
    credits: number;
  }>;
  health: {
    failures24h: number;
    webhookFailures: number;
    webhooksUnprocessed: number;
  };
}

export interface UsagePoint {
  day: string;
  runs: number;
  successes: number;
  failures: number;
  credits: number;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string | null;
  country: string | null;
  userType: string | null;
  createdAt: string;
  planKey: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  credits: number;
  roles: AppRole[];
}

export interface AdminUserDetail {
  profile: {
    id: string;
    email: string;
    fullName: string | null;
    country: string | null;
    timezone: string | null;
    userType: string | null;
    createdAt: string;
  };
  roles: AppRole[];
  subscription: {
    planKey: string;
    planName: string;
    status: string;
    interval: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    provider: string;
  } | null;
  credits: {
    balance: number;
    purchased: number;
    monthlyAllowance: number;
    periodEnd: string | null;
  } | null;
  /** Counts only — never titles, never contents. */
  contentCounts: {
    documents: number;
    assignments: number;
    scans: number;
    grades: number;
  };
  usage30d: Array<{
    featureKey: string;
    runs: number;
    failures: number;
    credits: number;
  }>;
  recentCredits: Array<{
    type: string;
    amount: number;
    balanceAfter: number;
    reason: string | null;
    createdAt: string;
  }>;
}

/** The jsonb these functions return is snake_cased; read it defensively. */
type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
const asArray = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(asRow) : [];
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const nullableStr = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const roles = (value: unknown): AppRole[] =>
  Array.isArray(value)
    ? value.filter((role): role is AppRole =>
        role === "user" || role === "educator" || role === "admin",
      )
    : [];

export const getAdminOverview = cache(async (): Promise<AdminOverview | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview");

  if (error) {
    console.error("[admin] failed to load overview", error.message);
    return null;
  }

  const row = asRow(data);
  const users = asRow(row.users);
  const credits = asRow(row.credits);
  const revenue = asRow(row.revenue);
  const health = asRow(row.health);

  return {
    generatedAt: str(row.generated_at),
    users: {
      total: num(users.total),
      new7d: num(users.new_7d),
      new30d: num(users.new_30d),
    },
    subscriptions: asArray(row.subscriptions).map((entry) => ({
      planKey: str(entry.plan_key),
      planName: str(entry.plan_name),
      count: num(entry.count),
      monthlyCents: num(entry.monthly_cents),
    })),
    credits: {
      outstanding: num(credits.outstanding),
      consumed30d: num(credits.consumed_30d),
      refunded30d: num(credits.refunded_30d),
    },
    revenue: {
      cents30d: num(revenue.cents_30d),
      payments30d: num(revenue.payments_30d),
    },
    usage30d: asArray(row.usage_30d).map((entry) => ({
      featureKey: str(entry.feature_key),
      featureName: str(entry.feature_name) || str(entry.feature_key),
      runs: num(entry.runs),
      successes: num(entry.successes),
      failures: num(entry.failures),
      rejections: num(entry.rejections),
      credits: num(entry.credits),
    })),
    health: {
      failures24h: num(health.failures_24h),
      webhookFailures: num(health.webhook_failures),
      webhooksUnprocessed: num(health.webhooks_unprocessed),
    },
  };
});

export const getUsageSeries = cache(
  async (days = 30): Promise<UsagePoint[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_usage_series", {
      p_days: days,
    });

    if (error) {
      console.error("[admin] failed to load usage series", error.message);
      return [];
    }

    return asArray(data).map((entry) => ({
      day: str(entry.day),
      runs: num(entry.runs),
      successes: num(entry.successes),
      failures: num(entry.failures),
      credits: num(entry.credits),
    }));
  },
);

export const findUsers = cache(
  async (query?: string, limit = 25): Promise<AdminUserSummary[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_find_users", {
      p_query: query ?? null,
      p_limit: limit,
    });

    if (error) {
      console.error("[admin] failed to search accounts", error.message);
      return [];
    }

    return asArray(data).map((entry) => ({
      id: str(entry.id),
      email: str(entry.email),
      fullName: nullableStr(entry.full_name),
      country: nullableStr(entry.country),
      userType: nullableStr(entry.user_type),
      createdAt: str(entry.created_at),
      planKey: nullableStr(entry.plan_key),
      planName: nullableStr(entry.plan_name),
      subscriptionStatus: nullableStr(entry.subscription_status),
      credits: num(entry.credits),
      roles: roles(entry.roles),
    }));
  },
);

export const getUserDetail = cache(
  async (userId: string): Promise<AdminUserDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_user_detail", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[admin] failed to load account", error.message);
      return null;
    }

    const row = asRow(data);
    const profile = asRow(row.profile);
    const subscription = row.subscription ? asRow(row.subscription) : null;
    const credits = row.credits ? asRow(row.credits) : null;
    const counts = asRow(row.content_counts);

    if (!str(profile.id)) return null;

    return {
      profile: {
        id: str(profile.id),
        email: str(profile.email),
        fullName: nullableStr(profile.full_name),
        country: nullableStr(profile.country),
        timezone: nullableStr(profile.timezone),
        userType: nullableStr(profile.user_type),
        createdAt: str(profile.created_at),
      },
      roles: roles(row.roles),
      subscription: subscription
        ? {
            planKey: str(subscription.plan_key),
            planName: str(subscription.plan_name),
            status: str(subscription.status),
            interval: str(subscription.interval),
            currentPeriodEnd: nullableStr(subscription.current_period_end),
            cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
            provider: str(subscription.provider),
          }
        : null,
      credits: credits
        ? {
            balance: num(credits.balance),
            purchased: num(credits.purchased),
            monthlyAllowance: num(credits.monthly_allowance),
            periodEnd: nullableStr(credits.period_end),
          }
        : null,
      contentCounts: {
        documents: num(counts.documents),
        assignments: num(counts.assignments),
        scans: num(counts.scans),
        grades: num(counts.grades),
      },
      usage30d: asArray(row.usage_30d).map((entry) => ({
        featureKey: str(entry.feature_key),
        runs: num(entry.runs),
        failures: num(entry.failures),
        credits: num(entry.credits),
      })),
      recentCredits: asArray(row.recent_credits).map((entry) => ({
        type: str(entry.type),
        amount: num(entry.amount),
        balanceAfter: num(entry.balance_after),
        reason: nullableStr(entry.reason),
        createdAt: str(entry.created_at),
      })),
    };
  },
);

/** The audit trail. Readable by administrators only, by policy. */
export const listAuditLog = cache(
  async (limit = 50): Promise<AuditLogRow[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[admin] failed to read the audit log", error.message);
      return [];
    }

    return data ?? [];
  },
);
