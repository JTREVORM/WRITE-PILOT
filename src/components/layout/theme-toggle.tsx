"use client";

import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { setThemeAction } from "@/lib/theme/actions";
import { THEMES, type Theme } from "@/lib/theme/constants";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Three-way theme control.
 *
 * Applies the change to the document immediately so it feels instant, then
 * persists it in the background. The server reads that cookie on the next
 * render, which is what prevents a flash on a cold load — this component never
 * needs to "correct" the page after hydration.
 */
export function ThemeToggle({ value }: { value: Theme }) {
  const [, startTransition] = useTransition();

  // The server prop is the source of truth; the local override only exists so a
  // click reads back instantly instead of waiting for the next render. Resetting
  // it during render when the prop changes is React's documented way to adjust
  // state on a prop change -- an effect here would cause a cascading render.
  const [optimistic, setOptimistic] = useState<Theme | null>(null);
  const [lastValue, setLastValue] = useState<Theme>(value);

  if (lastValue !== value) {
    setLastValue(value);
    setOptimistic(null);
  }

  const theme = optimistic ?? value;

  function apply(next: Theme) {
    setOptimistic(next);

    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", next);
    }

    startTransition(() => {
      void setThemeAction(next);
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={option.label}
            onClick={() => apply(option.value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              isActive
                ? "bg-surface text-foreground shadow-subtle"
                : "text-foreground-subtle hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { THEMES };
