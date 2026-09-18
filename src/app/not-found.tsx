import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button";
import { routes } from "@/lib/config/routes";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Logo />
      <div className="space-y-2">
        <p className="text-sm font-medium text-brand-600">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          We couldn&apos;t find that page
        </h1>
        <p className="text-sm text-foreground-muted">
          The link may be out of date, or the page may have moved.
        </p>
      </div>
      <div>
        <Link href={routes.home} className={buttonStyles()}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
