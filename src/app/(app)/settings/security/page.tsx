import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/config/routes";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Account & security",
  robots: { index: false, follow: false },
};

export default async function SecuritySettingsPage() {
  const { user } = await requireProfile();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Sign-in</CardTitle>
          <CardDescription>
            You sign in with {user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground-muted">Email confirmed</span>
            <span className="font-medium">
              {user.email_confirmed_at
                ? formatDate(user.email_confirmed_at)
                : "Not yet confirmed"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground-muted">Last sign-in</span>
            <span className="font-medium">
              {formatDate(user.last_sign_in_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>

          <Link
            href={routes.forgotPassword}
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            Change password
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Your data</CardTitle>
          <CardDescription>
            Documents you upload are private to your account and are never used
            to train models.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert tone="info">
            Full data export and account deletion arrive alongside the document
            workspace. Until then, email{" "}
            <Link href={`mailto:support@writepilot.app`}>support</Link> and we
            will delete your account and its data on request.
          </Alert>
        </CardContent>
      </Card>
    </>
  );
}
