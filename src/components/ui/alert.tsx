import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: {
    box: "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100",
    icon: Info,
    iconClass: "text-brand-600 dark:text-brand-400",
  },
  success: {
    box: "border-success-500/30 bg-success-50 text-success-700 dark:bg-success-700/15 dark:text-success-500",
    icon: CheckCircle2,
    iconClass: "text-success-600",
  },
  warning: {
    box: "border-warning-500/30 bg-warning-50 text-warning-700 dark:bg-warning-700/15 dark:text-warning-500",
    icon: AlertTriangle,
    iconClass: "text-warning-600",
  },
  danger: {
    box: "border-danger-500/30 bg-danger-50 text-danger-700 dark:bg-danger-700/15 dark:text-danger-500",
    icon: XCircle,
    iconClass: "text-danger-600",
  },
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  title?: string;
  /** Errors are announced assertively; everything else politely. */
  live?: boolean;
}

export function Alert({
  className,
  tone = "info",
  title,
  live,
  children,
  ...props
}: AlertProps) {
  const { box, icon: Icon, iconClass } = TONES[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={live ? (tone === "danger" ? "assertive" : "polite") : undefined}
      className={cn(
        "flex gap-3 rounded-lg border p-3.5 text-sm",
        box,
        className,
      )}
      {...props}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-0.5", "[&_a]:underline")}>{children}</div>
      </div>
    </div>
  );
}
