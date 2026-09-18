import { cn } from "@/lib/utils/cn";

/** Loading placeholder. Paired with Suspense boundaries in the app shell. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-muted", className)}
      aria-hidden="true"
    />
  );
}
