import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/auth/profile-form";
import { requireProfile } from "@/lib/auth/session";
import { getCurrentRoles } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

const ROLE_LABELS: Record<string, string> = {
  user: "User",
  educator: "Educator",
  admin: "Administrator",
};

export default async function SettingsProfilePage() {
  const { profile } = await requireProfile();
  const roles = await getCurrentRoles();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Profile</CardTitle>
          <CardDescription>
            This information personalises your workspace. It is never shared.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground-muted">Member since</span>
            <span className="font-medium">{formatDate(profile.created_at)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground-muted">Access level</span>
            <span className="flex flex-wrap justify-end gap-1.5">
              {roles.length === 0 ? (
                <Badge tone="outline">None</Badge>
              ) : (
                roles.map((role) => (
                  <Badge key={role} tone={role === "admin" ? "brand" : "neutral"}>
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                ))
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
