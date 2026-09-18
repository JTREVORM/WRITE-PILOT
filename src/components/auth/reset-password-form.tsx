"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "./form-message";
import { updatePasswordAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/utils/result";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState<
    ActionResult<never> | null,
    FormData
  >(updatePasswordAction, null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />

      <Field
        label="New password"
        htmlFor="password"
        errors={fieldErrors?.password}
        hint="At least 10 characters, including a letter and a number."
        required
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        errors={fieldErrors?.confirmPassword}
        required
      >
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={isPending} className="w-full">
        Update password
      </Button>
    </form>
  );
}
