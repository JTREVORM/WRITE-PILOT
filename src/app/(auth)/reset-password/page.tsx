import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/auth/session";
import { routes } from "@/lib/config/routes";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * Reached from the recovery link, which establishes a session before landing
 * here. Without that session there is nothing to update, so the page says so
 * rather than showing a form that cannot succeed.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            This link has expired
          </h1>
          <p className="text-sm text-foreground-muted">
            Password reset links can only be used once, and expire after an hour.
          </p>
        </div>

        <Alert tone="warning">
          Request a new link and it will arrive within a few minutes.
        </Alert>

        <Link
          href={routes.forgotPassword}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm text-foreground-muted">
          You&apos;re updating the password for{" "}
          <span className="font-medium text-foreground">{user.email}</span>.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
