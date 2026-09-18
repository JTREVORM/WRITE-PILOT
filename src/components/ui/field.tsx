import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Form primitives.
 *
 * `Field` wires the label, control, hint and error together with the right aria
 * attributes, so accessible error reporting is the default rather than
 * something each form has to remember.
 */

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

const CONTROL_BASE =
  "w-full rounded-lg border bg-surface px-3 text-foreground shadow-subtle " +
  "placeholder:text-foreground-subtle transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger-500";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(CONTROL_BASE, "h-10 border-line-strong text-sm", className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        CONTROL_BASE,
        "min-h-28 border-line-strong py-2 text-sm",
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        CONTROL_BASE,
        "h-10 appearance-none border-line-strong pr-9 text-sm",
        // Chevron drawn as a background image so no wrapper element is needed.
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke-width=%271.5%27 stroke=%27%2371717a%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 d=%27m19.5 8.25-7.5 7.5-7.5-7.5%27/%3E%3C/svg%3E')]",
        "bg-[length:1.1rem] bg-[position:right_0.6rem_center] bg-no-repeat",
        className,
      )}
      {...props}
    />
  );
});

export function Checkbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "mt-0.5 size-4 shrink-0 rounded border-line-strong text-brand-600",
        "accent-brand-600",
        className,
      )}
      {...props}
    />
  );
}

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Renders a labelled control with its hint and validation errors.
 *
 * Children receive `aria-invalid` and `aria-describedby` via cloning so the
 * relationship is announced by screen readers without every call site wiring
 * the ids by hand.
 */
export function Field({
  label,
  htmlFor,
  hint,
  errors,
  required,
  className,
  children,
}: FieldProps) {
  const hasError = Boolean(errors?.length);
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = hasError ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>

      {React.isValidElement<Record<string, unknown>>(children)
        ? React.cloneElement(children, {
            id: htmlFor,
            "aria-invalid": hasError || undefined,
            "aria-describedby": describedBy,
          })
        : children}

      {hint ? (
        <p id={hintId} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      ) : null}

      {hasError ? (
        <p id={errorId} className="text-xs font-medium text-danger-600">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
