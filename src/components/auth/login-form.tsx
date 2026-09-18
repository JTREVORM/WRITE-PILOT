"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "./form-message";
import { signInAction } from "@/lib/auth/actions";
import { routes } from "@/lib/config/routes";
import type { ActionResult } from "@/lib/utils/result";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<never> | null,
    FormData
  >(signInAction, null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      <FormMessage state={state} />

      <Field
        label="Email"
        htmlFor="email"
        errors={fieldErrors?.email}
        required
      >
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          required
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Field
          label="Password"
          htmlFor="password"
          errors={fieldErrors?.password}
          required
        >
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Link
          href={routes.forgotPassword}
          className="self-end text-xs font-medium text-brand-600 hover:underline"
        >
          Forgot your password?
        </Link>
      </div>

      <Button type="submit" size="lg" loading={isPending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
