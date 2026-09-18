import Link from "next/link";
import { CircleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { ResendVerification } from "./resend-verification";
import { routes } from "@/lib/config/routes";
import type { ProfileRow } from "@/types/database";

/**
 * Outstanding account setup.
 *
 * Only rendered when there is something genuinely left to do, and it disappears
 * once there isn't. A permanent checklist full of steps that cannot be
 * completed yet would be noise — this is a prompt, not a scoreboard.
 */
export function SetupNotice({
  profile,
  emailConfirmed,
}: {
  profile: ProfileRow;
  emailConfirmed: boolean;
}) {
  const items: Array<{ key: string; title: string; body: string; action: React.ReactNode }> = [];

  if (!emailConfirmed) {
    items.push({
      key: "email",
      title: "Confirm your email address",
      body: `We sent a link to ${profile.email}. Confirming it secures your account and lets us reach you about your credits.`,
      action: <ResendVerification />,
    });
  }

  if (!profile.full_name || !profile.country) {
    items.push({
      key: "profile",
      title: "Finish your profile",
      body: "Adding your name and country helps us format dates and reports the way you expect.",
      action: (
        <Link
          href={routes.settings}
          className={buttonStyles({ variant: "outline", size: "sm" })}
        >
          Update profile
        </Link>
      ),
    });
  }

  if (items.length === 0) return null;

  return (
    <Card className="border-warning-500/30 bg-warning-50/60 dark:bg-warning-700/10">
      <div className="flex gap-3 p-5">
        <CircleAlert
          className="mt-0.5 size-4 shrink-0 text-warning-600"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Finish setting up</h2>

          <ul className="mt-3 space-y-4">
            {items.map((item) => (
              <li key={item.key} className="space-y-2">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-sm text-foreground-muted">{item.body}</p>
                {item.action}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
