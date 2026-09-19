/**
 * Values the browser needs as well as the server.
 *
 * The service module is `server-only`, so the minimum the form gates on lives
 * here rather than being copied into the component — a form that gates on a
 * different number from the one the server enforces is a form that lies about
 * why its button is disabled.
 */

/** Below this there is not enough draft to review. */
export const MIN_WORDS_FOR_ANALYSIS = 150;
