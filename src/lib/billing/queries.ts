import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { CreditPackRow, PaymentRow, PlanRow } from "@/types/database";

/** Catalogue reads (public) and payment history (owner-scoped by RLS). */

export type PublicPlan = Pick<
  PlanRow,
  | "id"
  | "key"
  | "name"
  | "tagline"
  | "description"
  | "currency"
  | "price_monthly_cents"
  | "price_yearly_cents"
  | "monthly_credits"
  | "max_documents"
  | "max_file_size_mb"
  | "max_words_per_request"
  | "credits_roll_over"
  | "priority_processing"
  | "is_highlighted"
  | "provider_price_id_monthly"
  | "provider_price_id_yearly"
>;

export const listPublicPlans = cache(async (): Promise<PublicPlan[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    // One literal, not a concatenation: the client derives the row type from
    // the string it is given, and a concatenation defeats that.
    .select(
      "id, key, name, tagline, description, currency, price_monthly_cents, price_yearly_cents, monthly_credits, max_documents, max_file_size_mb, max_words_per_request, credits_roll_over, priority_processing, is_highlighted, provider_price_id_monthly, provider_price_id_yearly",
    )
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[billing] failed to list plans", error.message);
    return [];
  }

  return data ?? [];
});

export type PublicPack = Pick<
  CreditPackRow,
  "id" | "key" | "name" | "description" | "credits" | "price_cents" | "currency" | "provider_price_id"
>;

export const listCreditPacks = cache(async (): Promise<PublicPack[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_packs")
    .select("id, key, name, description, credits, price_cents, currency, provider_price_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[billing] failed to list credit packs", error.message);
    return [];
  }

  return data ?? [];
});

export const listPayments = cache(async (limit = 20): Promise<PaymentRow[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[billing] failed to list payments", error.message);
    return [];
  }

  return data ?? [];
});
