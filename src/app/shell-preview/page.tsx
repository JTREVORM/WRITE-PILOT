import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatGridSkeleton } from "@/components/dashboard/section-skeletons";
import type { ProfileRow } from "@/types/database";

export const metadata: Metadata = {
  title: "Shell preview",
  robots: { index: false, follow: false },
};

/**
 * Development harness for the signed-in shell.
 *
 * The application shell only renders behind authentication, which makes it
 * awkward to check in a browser and easy to ship broken — two real layout bugs
 * (a non-serializable icon crossing the server/client boundary, and the drawer
 * being clipped by the header's backdrop filter) reached the repository exactly
 * because nothing rendered this tree outside a live session.
 *
 * It uses fixture data and no session. Every data-fetching part of the shell
 * degrades gracefully when Supabase is unreachable, so this renders the real
 * component tree rather than a mock of it.
 *
 * Unreachable in production: `notFound()` runs before anything else.
 */
const FIXTURE_PROFILE: ProfileRow = {
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

export default function ShellPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AppShell profile={FIXTURE_PROFILE} roles={["user"]} theme="system">
      <div className="space-y-8">
        <PageHeader
          title="Good morning, Ada"
          description="Fixture data. This route exists so the shell can be checked in a browser without a live Supabase project."
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Shell preview" },
          ]}
        />
        <StatGridSkeleton />
      </div>
    </AppShell>
  );
}
