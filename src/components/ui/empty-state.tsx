import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * The empty state every list falls back to.
 *
 * Says what would be here and how to put something here, rather than showing a
 * bare "No results".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-muted">
          <Icon className="size-5 text-foreground-subtle" aria-hidden="true" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-foreground-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
