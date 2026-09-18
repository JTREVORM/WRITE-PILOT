import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils/cn";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "link";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-subtle hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "bg-surface-muted text-foreground hover:bg-line border border-line",
  outline:
    "border border-line-strong bg-surface text-foreground hover:bg-surface-muted",
  ghost: "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
  danger: "bg-danger-600 text-white shadow-subtle hover:bg-danger-700",
  link: "text-brand-600 underline-offset-4 hover:underline p-0 h-auto",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
  icon: "size-10 justify-center",
};

/**
 * Button styling as a standalone helper.
 *
 * Lets a `<Link>` look exactly like a button without wrapping one in the other
 * (which would nest an anchor in a button) and without an `asChild` polymorph.
 */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium",
    "transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-55",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks interaction. Width is preserved to avoid jump. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", loading, disabled, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonStyles({ variant, size, className })}
        {...props}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {children}
      </button>
    );
  },
);
