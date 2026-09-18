"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
 * opens over the content, locks background scroll, and closes on Escape, on a
 * backdrop tap, or on any navigation.
 *
 * The overlay is rendered into document.body through a portal. It has to be:
 * the trigger lives in the sticky header, and that header uses a backdrop blur.
 * An element with a backdrop-filter becomes the containing block for its
 * `position: fixed` descendants, so an overlay rendered in place would be
 * clipped to the height of the header bar instead of covering the viewport.
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

  const overlay = (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setOpenedOn(null)}
        className="absolute inset-0 animate-fade-in bg-ink-950/45 backdrop-blur-[2px]"
      />

      <div
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col",
          "animate-rise border-r border-line bg-surface shadow-raised",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <Logo />
          <button
            type="button"
            onClick={() => setOpenedOn(null)}
            aria-label="Close navigation menu"
            className="rounded-lg p-2 text-foreground-muted hover:bg-surface-muted"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={sections} onNavigate={() => setOpenedOn(null)} />
        </div>

        {children ? (
          <div className="shrink-0 border-t border-line p-3">{children}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedOn(pathname)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="-ml-1.5 rounded-lg p-2 text-foreground-muted hover:bg-surface-muted lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {/* `open` can only become true from a click, so document is always
          available by the time this renders — no mount guard needed. */}
      {open ? createPortal(overlay, document.body) : null}
    </>
  );
}
