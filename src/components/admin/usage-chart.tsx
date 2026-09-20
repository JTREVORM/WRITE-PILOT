"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/utils/format";
import { barHeight, niceMax } from "@/lib/admin/scale";
import type { UsagePoint } from "@/lib/admin/queries";

/**
 * Runs per day.
 *
 * One series, so there is no legend: the heading names what is plotted, and a
 * box with a single swatch would only restate it. The bars are one hue — a step
 * chosen per mode against that mode's surface rather than flipped automatically
 * — with a rounded cap and a square base, a 2px gap doing the separating, and a
 * hairline baseline.
 *
 * Values are not printed on every column; the extreme is labelled, the axis
 * carries the rest, and hovering gives the exact figure. The same numbers are
 * also in a table for anyone not using a pointer, because a chart that gates
 * its data behind hover is a chart some people cannot read.
 */

function shortDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en", { day: "numeric", month: "short" });
}

export function UsageChart({
  points,
  className,
}: {
  points: UsagePoint[];
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const tableId = useId();

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-foreground-muted">
        No activity recorded yet.
      </p>
    );
  }

  const peak = Math.max(...points.map((point) => point.runs));
  const max = niceMax(peak);
  const peakIndex = points.findIndex((point) => point.runs === peak);
  const active = hovered === null ? null : points[hovered];

  return (
    <figure className={cn("space-y-3", className)}>
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">Runs per day</span>
        <span
          className="text-xs tabular-nums text-foreground-muted"
          aria-live="polite"
        >
          {active
            ? `${shortDay(active.day)}: ${formatNumber(active.runs)} runs, ${formatNumber(active.failures)} failed`
            : `${formatNumber(points.reduce((total, point) => total + point.runs, 0))} in ${points.length} days`}
        </span>
      </figcaption>

      <div className="flex gap-3">
        {/* Axis ticks carry the values the columns are not labelled with. */}
        <div
          className="flex w-10 shrink-0 flex-col justify-between py-0.5 text-right text-[11px] tabular-nums text-foreground-subtle"
          aria-hidden="true"
        >
          <span>{formatNumber(max)}</span>
          <span>{formatNumber(Math.round(max / 2))}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="flex h-40 items-end gap-0.5 border-b border-line"
            onMouseLeave={() => setHovered(null)}
            role="img"
            aria-label={`Runs per day over the last ${points.length} days. The table below has the figures.`}
            aria-describedby={tableId}
          >
            {points.map((point, index) => {
              const isPeak = index === peakIndex && peak > 0;

              return (
                <div
                  key={point.day}
                  className="group relative flex h-full max-w-6 flex-1 items-end"
                  onMouseEnter={() => setHovered(index)}
                >
                  {/* A hit target the full height of the plot: a 3px column is
                      not something anyone can reliably point at. */}
                  <div
                    className={cn(
                      "w-full rounded-t-[4px] bg-brand-600 transition-opacity dark:bg-brand-500",
                      hovered !== null && hovered !== index && "opacity-40",
                    )}
                    style={{ height: `${barHeight(point.runs, max)}%` }}
                  />

                  {isPeak && hovered === null ? (
                    <span className="pointer-events-none absolute inset-x-0 -top-0.5 text-center text-[10px] tabular-nums text-foreground-muted">
                      {formatNumber(peak)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 flex justify-between text-[11px] text-foreground-subtle">
            <span>{shortDay(points[0]!.day)}</span>
            <span>{shortDay(points[points.length - 1]!.day)}</span>
          </div>
        </div>
      </div>

      <table id={tableId} className="sr-only">
        <caption>Runs per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Runs</th>
            <th scope="col">Succeeded</th>
            <th scope="col">Failed</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{shortDay(point.day)}</th>
              <td>{point.runs}</td>
              <td>{point.successes}</td>
              <td>{point.failures}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
