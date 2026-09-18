/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils/cn";
import { initialsFrom } from "@/lib/utils/format";

export interface AvatarProps {
  name: string | null | undefined;
  email: string;
  src?: string | null;
  className?: string;
}

/**
 * Profile avatar with an initials fallback.
 *
 * Uses a plain <img> rather than next/image: avatars come from arbitrary
 * external identity providers, and allow-listing every possible host in
 * next.config is not workable.
 */
export function Avatar({ name, email, src, className }: AvatarProps) {
  const base = cn(
    "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
    className,
  );

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(base, "object-cover")}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className={cn(base, "bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200")}
      aria-hidden="true"
    >
      {initialsFrom(name, email)}
    </span>
  );
}
