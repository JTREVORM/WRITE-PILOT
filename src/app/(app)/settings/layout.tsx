import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { routes } from "@/lib/config/routes";

/**
 * Settings shell.
 *
 * The heading and tabs live here rather than in each page so they are part of
 * the static shell: switching tabs re-renders only the panel below, and the
 * navigation never flickers.
 */
export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, your sign-in details and your data."
        breadcrumbs={[
          { label: "Dashboard", href: routes.dashboard },
          { label: "Settings" },
        ]}
      />

      <SettingsNav />

      <div className="space-y-6">{children}</div>
    </div>
  );
}
