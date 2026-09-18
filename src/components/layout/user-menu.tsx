"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings as SettingsIcon, User } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/config/routes";
import { signOutAction } from "@/lib/auth/actions";

export interface UserMenuProps {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  planName: string | null;
}

/**
 * Account menu in the top bar.
 *
 * Built on native focus handling rather than a headless-UI dependency: it
 * closes on Escape, on outside click and on blur out of the menu, which covers
 * keyboard and pointer users without shipping another runtime.
 */
export function UserMenu({ name, email, avatarUrl, planName }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-2 rounded-lg p-1.5 pr-2 transition-colors",
          "hover:bg-surface-muted",
          open && "bg-surface-muted",
        )}
      >
        <Avatar name={name} email={email} src={avatarUrl} />
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {name ?? email}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-foreground-subtle transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-50 mt-2 w-60 origin-top-right overflow-hidden",
            "rounded-card border border-line bg-surface-raised shadow-raised",
            "animate-rise",
          )}
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-sm font-medium">{name ?? "Your account"}</p>
            <p className="truncate text-xs text-foreground-muted">{email}</p>
            {planName ? (
              <p className="mt-1.5 text-xs font-medium text-brand-600">
                {planName} plan
              </p>
            ) : null}
          </div>

          <div className="p-1.5">
            <Link
              href={routes.settings}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
            >
              <User className="size-4" aria-hidden="true" />
              Profile
            </Link>
            <Link
              href={routes.settingsSecurity}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
              Account & security
            </Link>
          </div>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              disabled={isSigningOut}
              onClick={() => startSignOut(() => void signOutAction())}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
