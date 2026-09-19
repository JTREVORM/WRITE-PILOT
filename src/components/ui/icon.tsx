import {
  Activity,
  BarChart3,
  Bell,
  BookMarked,
  CalendarClock,
  Coins,
  Compass,
  CreditCard,
  FileSearch,
  FileText,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  Quote,
  Settings,
  ShieldCheck,
  Sparkles,
  SpellCheck,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Icon registry.
 *
 * Configuration that crosses the server/client boundary — the navigation tree,
 * the quick actions — refers to icons by *name* rather than holding the
 * component itself. A React component is a function, and functions cannot be
 * serialized from a Server Component into a Client Component; passing one
 * throws at render time.
 *
 * The registry is a plain module with no "use client" of its own, so a Server
 * Component can render from it directly and a Client Component can import it
 * and have it bundled. Only the *name* ever travels between the two.
 */
export const ICONS = {
  activity: Activity,
  assignments: BookMarked,
  bell: Bell,
  citations: Quote,
  coach: Compass,
  credits: Coins,
  dashboard: LayoutDashboard,
  detector: FileSearch,
  documents: FileText,
  grader: GraduationCap,
  grammar: SpellCheck,
  naturalize: Sparkles,
  plan: CreditCard,
  reset: CalendarClock,
  security: ShieldCheck,
  settings: Settings,
  upload: Upload,
  usage: BarChart3,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const Component = ICONS[name];
  return <Component className={cn("size-4", className)} aria-hidden="true" />;
}
