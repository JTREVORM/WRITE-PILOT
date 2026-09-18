import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  progress?: { value: number; max: number };
  className?: string;
  children?: React.ReactNode;
}

/** A single headline figure on the dashboard. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  progress,
  className,
  children,
}: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground-muted">{label}</p>
        {Icon ? (
          <Icon className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        ) : null}
      </div>

      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>

      {progress ? (
        <Progress
          className="mt-3"
          value={progress.value}
          max={progress.max}
          tone="auto"
          label={label}
        />
      ) : null}

      {hint ? (
        <p className="mt-2 text-xs text-foreground-muted">{hint}</p>
      ) : null}

      {children}
    </Card>
  );
}
