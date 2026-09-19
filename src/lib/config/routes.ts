/**
 * Route map and access classification.
 *
 * The middleware, the navigation and the server-side guards all read this file,
 * so a route's protection level is declared exactly once. Adding a protected
 * area means adding it here, not remembering to guard it in three places.
 */
export const routes = {
  home: "/",
  pricing: "/pricing",
  privacy: "/privacy",
  terms: "/terms",

  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  checkEmail: "/check-email",
  authCallback: "/auth/callback",
  authConfirm: "/auth/confirm",
  authError: "/auth/auth-code-error",

  dashboard: "/dashboard",
  aiDetector: "/tools/ai-detector",
  grammar: "/tools/grammar",
  naturalize: "/tools/naturalize",
  grader: "/tools/grader",
  documents: "/documents",
  usage: "/usage",
  billing: "/billing",
  settings: "/settings",
  settingsProfile: "/settings",
  settingsSecurity: "/settings/security",
  admin: "/admin",
} as const;

/** Prefixes that require an authenticated session. */
const PROTECTED_PREFIXES = [
  routes.dashboard,
  "/tools",
  routes.documents,
  routes.usage,
  routes.billing,
  routes.settings,
  routes.admin,
] as const;

/** Prefixes that require the admin role, checked again server-side. */
const ADMIN_PREFIXES = [routes.admin] as const;

/**
 * Pages that exist only for signed-out visitors. A signed-in user hitting one
 * is sent to the dashboard rather than shown a login form they do not need.
 */
const AUTH_ONLY_ROUTES = [
  routes.login,
  routes.register,
  routes.forgotPassword,
] as const;

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => matches(pathname, prefix));
}

export function isAdminRoute(pathname: string) {
  return ADMIN_PREFIXES.some((prefix) => matches(pathname, prefix));
}

export function isAuthOnlyRoute(pathname: string) {
  return AUTH_ONLY_ROUTES.some((prefix) => matches(pathname, prefix));
}

/**
 * Sanitises a `?next=` parameter before redirecting to it.
 *
 * Only same-site absolute paths are allowed: anything protocol-relative or
 * absolute would turn the sign-in flow into an open redirect.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = routes.dashboard,
) {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\")) return fallback;
  return candidate;
}
