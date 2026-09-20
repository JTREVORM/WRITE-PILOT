/**
 * The Content Security Policy.
 *
 * Built per request because it carries a nonce, and kept here rather than in
 * the proxy so the policy can be read, reasoned about and tested on its own.
 *
 * Three decisions in it are worth stating, because each looks like a mistake
 * until you know why:
 *
 * **`connect-src` names the Supabase origin.** The browser client talks to it
 * directly for auth and for realtime; without it the policy would lock users
 * out of their own accounts. It is read from the same public environment value
 * the client is configured with, so the two cannot drift.
 *
 * **`style-src-attr` allows inline attributes.** A meter's width and a bar's
 * height are data, computed per render, and there is no nonce mechanism for a
 * `style` attribute. A style attribute cannot execute script; the cost is a
 * narrow presentational channel, and the alternative is a stylesheet of
 * hundreds of generated percentage classes. `style-src` itself stays strict, so
 * an injected `<style>` block is still refused.
 *
 * **`'unsafe-eval'` is development-only.** React uses `eval` in development to
 * reconstruct server stacks in the browser. Production has neither the need nor
 * the allowance.
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** The Supabase project origin the browser client connects to. */
  supabaseUrl?: string | null;
}

/** The origin of a URL, or null when it is missing or malformed. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const supabase = originOf(supabaseUrl);

  // Supabase realtime is a websocket on the same host.
  const supabaseSocket = supabase ? supabase.replace(/^http/, "ws") : null;

  const connect = ["'self'", supabase, supabaseSocket].filter(Boolean).join(" ");

  const directives: Array<[string, string]> = [
    ["default-src", "'self'"],
    [
      "script-src",
      `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    ],
    /*
     * Either a nonce or `'unsafe-inline'`, never both: a browser *ignores*
     * `'unsafe-inline'` as soon as a nonce appears in the same directive. The
     * development server emits un-nonced inline styles for fast refresh, so
     * development gets the permissive form and production gets the nonce.
     * next/font self-hosts its files, so no font CDN is needed.
     */
    [
      "style-src",
      isDev ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`,
    ],
    ["style-src-attr", "'unsafe-inline'"],
    ["font-src", "'self'"],
    // Avatars come from identity providers, so an https image is allowed; a
    // blob or data URL covers locally generated previews.
    ["img-src", "'self' blob: data: https:"],
    ["connect-src", connect],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["worker-src", "'self' blob:"],
    ["manifest-src", "'self'"],
  ];

  const policy = directives
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");

  // Only meaningful over HTTPS, and actively unhelpful against a local dev
  // server reached over http.
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/** A fresh, unpredictable nonce. One per request, never reused. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
