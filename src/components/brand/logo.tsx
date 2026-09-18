import Link from "next/link";

import { cn } from "@/lib/utils/cn";
import { siteConfig } from "@/lib/config/site";

/**
 * The WritePilot mark: a paper plane cut from a page.
 *
 * Drawn inline as SVG so it inherits currentColor and stays crisp at every
 * size, rather than shipping a raster asset per theme.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-8", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <path
        d="M9 16.2 23.2 9.4a.5.5 0 0 1 .69.62l-4.6 13.4a.5.5 0 0 1-.9.08l-2.62-4.4-4.63-1.99a.5.5 0 0 1-.14-.9Z"
        fill="white"
      />
      <path
        d="m15.77 19.1 7.3-9.3"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  href = "/",
  showWordmark = true,
}: {
  className?: string;
  href?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2.5 rounded-lg", className)}
    >
      <LogoMark className="size-8" />
      {showWordmark ? (
        <span className="text-lg font-semibold tracking-tight text-foreground">
          {siteConfig.name}
        </span>
      ) : null}
      <span className="sr-only">{siteConfig.name} home</span>
    </Link>
  );
}
