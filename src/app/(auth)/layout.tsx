import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { siteConfig } from "@/lib/config/site";
import { routes } from "@/lib/config/routes";

const HIGHLIGHTS = [
  {
    title: "Analysis you can act on",
    body: "Prioritised, explained feedback — not a wall of generic AI commentary.",
  },
  {
    title: "Honest about uncertainty",
    body: "AI likelihood is reported as an estimate, and an AI grade is never presented as an official one.",
  },
  {
    title: "Your documents stay yours",
    body: "Private by default, visible only to you, and deletable at any time.",
  },
];

/**
 * Shell for the signed-out auth pages.
 *
 * Two columns on large screens: the form on the left where the eye lands, and a
 * quiet brand panel on the right. On a phone the panel is dropped entirely
 * rather than stacked, so the form is the first and only thing on screen.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-1 flex-col px-5 py-8 sm:px-8">
        <header className="mx-auto flex w-full max-w-md items-center justify-between">
          <Logo />
          <Link
            href={routes.home}
            className="text-sm text-foreground-muted hover:text-foreground"
          >
            Back to site
          </Link>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {children}
        </div>

        <footer className="mx-auto w-full max-w-md text-xs text-foreground-subtle">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href={routes.privacy} className="hover:text-foreground-muted">
              Privacy
            </Link>
            <Link href={routes.terms} className="hover:text-foreground-muted">
              Terms
            </Link>
            <span>
              © {new Date().getFullYear()} {siteConfig.name}
            </span>
          </div>
        </footer>
      </div>

      <aside className="relative hidden flex-col justify-center border-l border-line bg-surface px-12 lg:flex">
        <div className="max-w-md">
          <p className="font-serif text-3xl leading-tight text-foreground">
            {siteConfig.tagline}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
            {siteConfig.description}
          </p>

          <dl className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="border-l-2 border-brand-200 pl-4 dark:border-brand-800">
                <dt className="text-sm font-semibold text-foreground">
                  {item.title}
                </dt>
                <dd className="mt-1 text-sm text-foreground-muted">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
