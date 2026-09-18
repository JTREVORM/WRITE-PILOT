"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "./form-message";
import { signUpAction } from "@/lib/auth/actions";
import { routes } from "@/lib/config/routes";
import { COUNTRIES } from "@/lib/config/countries";
import type { ActionResult } from "@/lib/utils/result";

const USER_TYPES = [
  { value: "student", label: "Student" },
  { value: "researcher", label: "Researcher" },
  { value: "educator", label: "Educator" },
  { value: "professional", label: "Professional writer" },
  { value: "other", label: "Something else" },
];

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState<
    ActionResult<{ email: string }> | null,
    FormData
  >(signUpAction, null);

  // Captured in the browser so the account starts with the right timezone
  // without asking for it. Written straight to the DOM node rather than held in
  // state: the value differs between server and client, and assigning it here
  // avoids a hydration mismatch on a field the user never sees. The server
  // falls back to UTC if it arrives empty.
  const timezoneRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved && timezoneRef.current) {
        timezoneRef.current.value = resolved;
      }
    } catch {
      // Keep the "UTC" default.
    }
  }, []);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

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
          <p className="text-sm text-foreground-muted">
            If <span className="font-medium text-foreground">{state.data.email}</span>{" "}
            can be registered, we&apos;ve sent a link to confirm it. Open the link
            to finish setting up your account.
          </p>
        </div>
        <Alert tone="info">
          The link expires in 24 hours. If it doesn&apos;t arrive within a few
          minutes, check your spam folder.
        </Alert>
        <Link
          href={routes.login}
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input ref={timezoneRef} type="hidden" name="timezone" defaultValue="UTC" />

      <FormMessage state={state} />

      <Field
        label="Full name"
        htmlFor="fullName"
        errors={fieldErrors?.fullName}
        required
      >
        <Input name="fullName" autoComplete="name" required />
      </Field>

      <Field label="Email" htmlFor="email" errors={fieldErrors?.email} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="I am a" htmlFor="userType" errors={fieldErrors?.userType}>
          <Select name="userType" defaultValue="student">
            {USER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Country"
          htmlFor="country"
          errors={fieldErrors?.country}
          hint="Optional"
        >
          <Select name="country" defaultValue="">
            <option value="">Prefer not to say</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Password"
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
        label="Confirm password"
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

      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2.5 text-sm text-foreground-muted">
          <Checkbox name="marketingOptIn" />
          <span>Send me occasional product updates. No spam.</span>
        </label>

        <label className="flex items-start gap-2.5 text-sm text-foreground-muted">
          <Checkbox name="acceptTerms" required />
          <span>
            I agree to the{" "}
            <Link href={routes.terms} className="font-medium text-brand-600 hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href={routes.privacy} className="font-medium text-brand-600 hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {fieldErrors?.acceptTerms ? (
          <p className="text-xs font-medium text-danger-600">
            {fieldErrors.acceptTerms.join(" ")}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" loading={isPending} className="w-full">
        Create account
      </Button>
    </form>
  );
}
