import { cn } from "@/lib/utils/cn";

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  className?: string;
  /** Turns amber past 80% and red at 100% — used for credit and usage meters. */
  tone?: "brand" | "auto";
}

export function Progress({
  value,
  max = 100,
  label,
  className,
  tone = "brand",
}: ProgressProps) {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  const barTone =
    tone === "auto"
      ? percent >= 100
        ? "bg-danger-500"
        : percent >= 80
          ? "bg-warning-500"
          : "bg-brand-600"
      : "bg-brand-600";

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-muted",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", barTone)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
