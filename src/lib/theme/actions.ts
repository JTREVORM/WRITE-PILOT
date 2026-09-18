"use server";

import { cookies } from "next/headers";

import { THEME_COOKIE, isTheme, type Theme } from "./constants";

/**
 * Persists a theme choice.
 *
 * The control updates the DOM itself for an instant response; this call only
 * records the decision so the *next* server render emits the right attribute
 * and the page never flashes the wrong palette on a cold load.
 *
 * Not httpOnly: the no-flash path needs the value to be readable by the client,
 * and a display preference is not a secret.
 */
export async function setThemeAction(theme: Theme): Promise<void> {
  if (!isTheme(theme)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
}
