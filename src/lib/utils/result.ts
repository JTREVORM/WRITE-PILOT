/**
 * Explicit success/failure results for anything a user can trigger.
 *
 * Server Actions return these rather than throwing, so the UI always has a
 * message it can render and a stable code it can branch on. Unexpected
 * exceptions still throw and are caught by the route's error boundary.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  error: string,
  options: { code?: string; fieldErrors?: Record<string, string[]> } = {},
): ActionResult<never> {
  return { ok: false, error, ...options };
}
