"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "./form-message";
import { updateProfileAction } from "@/lib/auth/actions";
import { COUNTRIES } from "@/lib/config/countries";
import type { ActionResult } from "@/lib/utils/result";
import type { ProfileRow } from "@/types/database";

const USER_TYPES = [
  { value: "student", label: "Student" },
  { value: "researcher", label: "Researcher" },
  { value: "educator", label: "Educator" },
  { value: "professional", label: "Professional writer" },
  { value: "other", label: "Something else" },
];

/** Common IANA zones, plus whatever the profile already has. */
function timezoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = ["UTC"];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function ProfileForm({ profile }: { profile: ProfileRow }) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(updateProfileAction, null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} successMessage="Your profile has been updated." />

      <Field
        label="Full name"
        htmlFor="fullName"
        errors={fieldErrors?.fullName}
        required
      >
        <Input
          name="fullName"
          defaultValue={profile.full_name ?? ""}
          autoComplete="name"
          required
        />
      </Field>

      <Field
        label="Email"
        htmlFor="email"
        hint="Your sign-in address. Contact support to change it."
      >
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={profile.email}
          disabled
          readOnly
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="I am a" htmlFor="userType" errors={fieldErrors?.userType}>
          <Select name="userType" defaultValue={profile.user_type}>
            {USER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Country" htmlFor="country" errors={fieldErrors?.country}>
          <Select name="country" defaultValue={profile.country ?? ""}>
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
        label="Timezone"
        htmlFor="timezone"
        hint="Used for dates, and for when your monthly credits reset."
        errors={fieldErrors?.timezone}
      >
        <Select name="timezone" defaultValue={profile.timezone}>
          {timezoneOptions(profile.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-start gap-2.5 text-sm text-foreground-muted">
        <Checkbox
          name="marketingOptIn"
          defaultChecked={profile.marketing_opt_in}
        />
        <span>Send me occasional product updates. No spam.</span>
      </label>

      <div>
        <Button type="submit" loading={isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
