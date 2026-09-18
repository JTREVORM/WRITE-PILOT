import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallbacks for the dashboard's streamed sections.
 *
 * Each mirrors the footprint of the content it stands in for, so the page does
 * not jump as sections arrive. They are deliberately quiet — a skeleton that
 * draws attention to itself is worse than a brief blank.
 */

export function StatGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-3 h-3 w-32" />
        </Card>
      ))}
    </div>
  );
}

export function QuickActionsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-28" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.5rem] rounded-card" />
        ))}
      </div>
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <Card className="lg:col-span-3">
      <div className="border-b border-line p-5 sm:p-6">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PlanPanelSkeleton() {
  return (
    <Card className="lg:col-span-2">
      <div className="border-b border-line p-5 sm:p-6">
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="space-y-3.5 p-5 sm:p-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        ))}
      </div>
    </Card>
  );
}
