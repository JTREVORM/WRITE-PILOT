import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/session";
import { getCurrentRoles } from "@/lib/auth/guards";
import { ensureProvisioned } from "@/lib/auth/provisioning";
import { getTheme } from "@/lib/theme/service";
import { routes } from "@/lib/config/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for every signed-in route.
 *
 * Authentication is checked here as well as in the proxy: the proxy can be
 * bypassed by a direct RSC request, so the server-rendered tree must never
 * assume it ran.
 *
 * Only the cheap reads are awaited here — the session, the profile and the
 * user's roles. Credits and notifications are fetched inside their own Suspense
 * boundaries in the shell, so the navigation is interactive before those
 * resolve. All three helpers are request-cached, so pages below re-read them
 * for free.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(routes.login);
  }

  let profile = await getCurrentProfile();

  // Self-heal an account whose signup trigger did not complete, rather than
  // rendering a broken shell. Idempotent, and a no-op for healthy accounts.
  if (!profile) {
    profile = await ensureProvisioned(user);
  }

  if (!profile) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">
          We couldn&apos;t open your workspace
        </h1>
        <p className="text-sm text-foreground-muted">
          Your account exists but its profile could not be loaded. Please try
          again in a moment — if it keeps happening, contact support and we will
          sort it out.
        </p>
        <form
          action={async () => {
            "use server";
            const supabase = await createClient();
            await supabase.auth.signOut();
            redirect(routes.login);
          }}
        >
          <button
            type="submit"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  const [roles, theme] = await Promise.all([getCurrentRoles(), getTheme()]);

  return (
    <AppShell profile={profile} roles={roles} theme={theme}>
      {children}
    </AppShell>
  );
}
