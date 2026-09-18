"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "./sidebar-nav";
import { cn } from "@/lib/utils/cn";
import type { NavSection } from "@/lib/config/navigation";

/**
 * Navigation drawer for small screens.
 *
 * A purpose-built mobile layout rather than the desktop sidebar squeezed: it
 * opens over the content, locks background scroll, closes on Escape, on
 * backdrop tap and whenever the route changes.
 */
export function MobileNav({
  sections,
  children,
}: {
  sections: NavSection[];
  children?: React.ReactNode;
}) {
  const pathname = usePathname();

  // The drawer is open only while the route is the one it was opened on, so any
  // navigation -- a link inside it, or the browser back button -- closes it
  // during render. Deriving this beats closing it from an effect, which would
  // render the drawer over the new page for a frame first.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;

  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      // Calls the setter directly so the effect has no changing dependency.
      if (event.key === "Escape") setOpenedOn(null);
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="-ml-1.5 rounded-lg p-2 text-foreground-muted hover:bg-surface-muted lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-fade-in"
          />

          <div
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col",
              "border-r border-line bg-surface shadow-raised animate-rise",
            )}
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-2 text-foreground-muted hover:bg-surface-muted"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
            </div>

            {children ? (
              <div className="border-t border-line p-3">{children}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
