import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { routes } from "@/lib/config/routes";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a free WritePilot account and start checking your writing today.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-sm text-foreground-muted">
          Free to start. No card required.
        </p>
      </div>

      <RegisterForm />

      <p className="text-sm text-foreground-muted">
        Already have an account?{" "}
        <Link
          href={routes.login}
          className="font-medium text-brand-600 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
