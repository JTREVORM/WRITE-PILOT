"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "./form-message";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { routes } from "@/lib/config/routes";
import type { ActionResult } from "@/lib/utils/result";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<
    ActionResult<{ email: string }> | null,
    FormData
  >(requestPasswordResetAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-success-50 dark:bg-success-700/20">
          <MailCheck className="size-5 text-success-600" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Check your inbox
          </h1>
          {/* Phrased so it reveals nothing about whether the address exists. */}
          <p className="text-sm text-foreground-muted">
            If an account exists for{" "}
            <span className="font-medium text-foreground">{state.data.email}</span>,
            we&apos;ve sent a link to reset your password. It expires in one hour.
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

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />

      <Field label="Email" htmlFor="email" errors={fieldErrors?.email} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={isPending} className="w-full">
        Send reset link
      </Button>

      <Link
        href={routes.login}
        className="text-center text-sm text-foreground-muted hover:text-foreground"
      >
        Back to sign in
      </Link>
    </form>
  );
}
