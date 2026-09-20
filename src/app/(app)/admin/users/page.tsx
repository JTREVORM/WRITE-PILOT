import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { findUsers } from "@/lib/admin/queries";
import { readParam } from "@/lib/documents/selection";
import { routes } from "@/lib/config/routes";
import { formatDate, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Accounts",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const query = readParam(params, "q") ?? "";
  const users = await findUsers(query || undefined);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Accounts"
        description="Plan, credits and roles. Not what anyone has written."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Admin", href: routes.admin },
          { label: "Accounts" },
        ]}
      />

      {/* A GET form, so a search is a URL an administrator can share with a
          colleague or keep in a ticket. */}
      <form className="flex flex-wrap gap-2" action={`${routes.admin}/users`}>
        <Input
          name="q"
          defaultValue={query}
          placeholder="Email or name…"
          aria-label="Search accounts"
          className="min-w-56 flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <Card>
        <CardContent className={users.length > 0 ? "p-0" : undefined}>
          {users.length === 0 ? (
            <EmptyState
              title="No accounts found"
              description={
                query
                  ? `Nothing matches “${query}”.`
                  : "No accounts have been created yet."
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {users.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`${routes.admin}/users/${user.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-muted sm:px-6"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {user.fullName ?? user.email}
                      </span>
                      <span className="block truncate text-xs text-foreground-muted">
                        {user.email} · joined {formatDate(user.createdAt)}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2">
                      {user.roles
                        .filter((role) => role !== "user")
                        .map((role) => (
                          <Badge key={role} tone="brand">
                            {role}
                          </Badge>
                        ))}
                      <Badge tone="neutral">{user.planName ?? "Free"}</Badge>
                      <span className="text-sm tabular-nums text-foreground-muted">
                        {formatNumber(user.credits)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
