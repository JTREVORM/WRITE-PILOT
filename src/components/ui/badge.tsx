import * as React from "react";

import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-foreground-muted",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200",
  success:
    "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500",
  warning:
    "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500",
  danger:
    "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500",
  outline: "border border-line-strong text-foreground-muted",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
