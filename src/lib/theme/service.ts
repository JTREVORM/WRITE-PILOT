import "server-only";

import { cookies } from "next/headers";

import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "./constants";

/** Reads the visitor's saved theme, falling back to following the system. */
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
