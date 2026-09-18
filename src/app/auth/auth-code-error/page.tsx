import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/config/routes";

export const metadata: Metadata = {
  title: "That link didn't work",
  robots: { index: false, follow: false },
};

/**
 * Landing page for a failed code exchange or token verification.
 *
 * The underlying reason is shown only when it is one we recognise; raw provider
 * messages are not echoed back to the browser.
 */
export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const expired = reason === "expired";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Logo />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {expired ? "This link has expired" : "That link didn't work"}
        </h1>
        <p className="text-sm text-foreground-muted">
          {expired
            ? "Confirmation and reset links can only be used once, and expire after a short time."
            : "The link may have already been used, or it may have been altered in transit."}
        </p>
      </div>

      <Alert tone="warning">
        Request a new link below — it only takes a moment.
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={routes.forgotPassword}
          className={buttonStyles({ className: "sm:flex-1" })}
        >
          Request a new link
        </Link>
        <Link
          href={routes.login}
          className={buttonStyles({ variant: "outline", className: "sm:flex-1" })}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
