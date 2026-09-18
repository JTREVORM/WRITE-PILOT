import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { routes } from "@/lib/config/routes";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex size-11 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950">
        <MailCheck className="size-5 text-brand-600" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Confirm your email
        </h1>
        <p className="text-sm text-foreground-muted">
          We&apos;ve sent you a confirmation link. Open it to activate your
          account — the link expires in 24 hours.
        </p>
      </div>

      <Link
        href={routes.login}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
