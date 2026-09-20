import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button";
import { siteConfig } from "@/lib/config/site";
import { routes } from "@/lib/config/routes";
import { getCurrentUser } from "@/lib/auth/session";

/** Public marketing shell. The full site is built out in Phase 13. */
export default async function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 sm:px-6">
          <Logo />
          <div className="flex-1" />

          {/* Hidden on the narrowest screens, where the sign-in and sign-up
              buttons already fill the row. It stays reachable in the footer. */}
          <Link
            href={routes.pricing}
            className={buttonStyles({
              variant: "ghost",
              size: "sm",
              className: "hidden sm:inline-flex",
            })}
          >
            Pricing
          </Link>

          {user ? (
            <Link href={routes.dashboard} className={buttonStyles({ size: "sm" })}>
              Open workspace
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={routes.login}
                className={buttonStyles({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
              <Link href={routes.register} className={buttonStyles({ size: "sm" })}>
                Get started
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Logo />
              <p className="mt-3 max-w-sm text-sm text-foreground-muted">
                {siteConfig.description}
              </p>
            </div>

            <nav
              aria-label="Footer"
              className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground-muted"
            >
              <Link href={routes.pricing} className="hover:text-foreground">
                Pricing
              </Link>
              <Link href={routes.privacy} className="hover:text-foreground">
                Privacy
              </Link>
              <Link href={routes.terms} className="hover:text-foreground">
                Terms
              </Link>
              <Link href={routes.login} className="hover:text-foreground">
                Sign in
              </Link>
            </nav>
          </div>

          <p className="mt-8 border-t border-line pt-6 text-xs text-foreground-subtle">
            © {new Date().getFullYear()} {siteConfig.name}. WritePilot is a
            writing-improvement tool. It does not guarantee academic acceptance
            or any particular grade.
          </p>
        </div>
      </footer>
    </div>
  );
}
