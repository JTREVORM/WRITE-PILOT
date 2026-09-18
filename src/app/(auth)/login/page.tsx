import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";
import { routes, safeRedirectPath } from "@/lib/config/routes";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your WritePilot workspace.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next !== routes.dashboard
      ? safeRedirectPath(params.next)
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-foreground-muted">
          Sign in to pick up where you left off.
        </p>
      </div>

      {params.reset === "success" ? (
        <Alert tone="success">
          Your password has been updated. Sign in with your new password.
        </Alert>
      ) : null}

      {nextPath ? (
        <Alert tone="info">Sign in to continue to that page.</Alert>
      ) : null}

      <LoginForm nextPath={nextPath} />

      <p className="text-sm text-foreground-muted">
        New to WritePilot?{" "}
        <Link
          href={routes.register}
          className="font-medium text-brand-600 hover:underline"
        >
          Create a free account
        </Link>
      </p>
    </div>
  );
}
