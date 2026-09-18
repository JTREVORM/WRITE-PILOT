import { NavLink } from "./nav-link";
import type { NavSection } from "@/lib/config/navigation";

export function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`} className="flex flex-col gap-1">
          {section.title ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground-subtle">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}
