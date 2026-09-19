/**
 * Values the browser needs as well as the server.
 *
 * The service module is `server-only`, so anything the form has to agree with
 * lives here instead of being copied into the component — the same split the
 * document upload constants use. A form that gates on a different minimum from
 * the one the server enforces is a form that lies about why it is disabled.
 */

/** Below this there is not enough document to check citations in. */
export const MIN_WORDS_FOR_CITATIONS = 50;
