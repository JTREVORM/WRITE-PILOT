import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/database";

/**
 * Notification reads.
 *
 * Queried through the user's own Supabase client, so Row Level Security scopes
 * every result to the caller. There is deliberately no `user_id` filter in
 * these queries: the policy is the filter, and adding a redundant one invites
 * the mistake of relying on it.
 */

export type NotificationItem = Pick<
  NotificationRow,
  "id" | "type" | "title" | "body" | "action_url" | "read_at" | "created_at"
>;

export interface NotificationSummary {
  items: NotificationItem[];
  unreadCount: number;
}

/** Recent notifications plus the unread total, for the shell's bell menu. */
export const getNotificationSummary = cache(
  async (limit = 8): Promise<NotificationSummary> => {
    const supabase = await createClient();

    const [listResult, countResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, type, title, body, action_url, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);

    if (listResult.error) {
      // The shell must still render. An empty bell is a far better outcome than
      // a failed page, and the cause is in the server logs either way.
      console.error("[notifications] failed to list", listResult.error.message);
      return { items: [], unreadCount: 0 };
    }

    if (countResult.error) {
      console.error("[notifications] failed to count", countResult.error.message);
    }

    return {
      items: listResult.data ?? [],
      unreadCount: countResult.count ?? 0,
    };
  },
);

/**
 * Records a notification if the user has never had one of this type.
 *
 * Used for once-per-account messages such as the welcome note, where the
 * producer may run more than once (a confirmation link opened twice, a retried
 * request) but the user should only ever see one.
 */
export async function hasNotificationOfType(
  userId: string,
  type: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", type);

  if (error) {
    // Fail closed: if we cannot tell, do not risk sending a duplicate.
    console.error("[notifications] failed to check type", error.message);
    return true;
  }

  return (count ?? 0) > 0;
}
