/**
 * Theme selection.
 *
 * Shared by the server (which renders the chosen theme into the HTML so there
 * is no flash of the wrong palette) and the client control. Deliberately free
 * of server-only imports so both sides can use it.
 */

export const THEME_COOKIE = "wp-theme";

export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * The value written to `data-theme` on the html element.
 *
 * "system" renders no attribute at all, which hands the decision to the
 * `prefers-color-scheme` media query in globals.css. That is what lets the
 * default work correctly on the server, where the user's OS preference is
 * unknowable.
 */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
