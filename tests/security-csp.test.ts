import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCsp, originOf } from "../src/lib/security/csp.ts";

const SUPABASE = "https://abcdefgh.supabase.co";

/**
 * A policy that blocks the application's own backend is a policy that gets
 * turned off within a day, so the parts that must be present are asserted
 * rather than assumed.
 */

describe("originOf", () => {
  it("reduces a URL to its origin", () => {
    assert.equal(originOf("https://x.supabase.co/rest/v1"), "https://x.supabase.co");
  });

  it("returns null rather than throwing on nonsense", () => {
    assert.equal(originOf("not a url"), null);
    assert.equal(originOf(""), null);
    assert.equal(originOf(null), null);
  });
});

describe("buildCsp", () => {
  const policy = buildCsp({ nonce: "abc123", isDev: false, supabaseUrl: SUPABASE });

  it("carries the request's nonce into script-src", () => {
    assert.match(policy, /script-src [^;]*'nonce-abc123'/);
  });

  it("uses strict-dynamic so a bundle's own imports still load", () => {
    assert.match(policy, /script-src [^;]*'strict-dynamic'/);
  });

  it("allows the browser to reach Supabase, over https and over a socket", () => {
    assert.match(policy, new RegExp(`connect-src [^;]*${SUPABASE}`));
    assert.match(policy, /connect-src [^;]*wss:\/\/abcdefgh\.supabase\.co/);
  });

  it("refuses framing, plugins and a rewritten base URL", () => {
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /base-uri 'self'/);
  });

  it("allows inline style attributes but not inline stylesheets", () => {
    // A width computed per render has no nonce mechanism; an injected <style>
    // block still has to carry one.
    assert.match(policy, /style-src-attr 'unsafe-inline'/);
    assert.ok(
      !/style-src [^;]*'unsafe-inline'/.test(policy),
      "style-src itself must stay strict in production",
    );
  });

  it("does not allow eval in production", () => {
    assert.ok(!policy.includes("'unsafe-eval'"), policy);
  });

  it("allows eval in development, where React needs it for stack traces", () => {
    const dev = buildCsp({ nonce: "n", isDev: true, supabaseUrl: SUPABASE });
    assert.match(dev, /script-src [^;]*'unsafe-eval'/);
  });

  it("never puts a nonce and 'unsafe-inline' in the same directive", () => {
    // A browser ignores 'unsafe-inline' as soon as a nonce appears beside it,
    // so the combination is not lenient — it is strict and surprising.
    for (const value of [
      buildCsp({ nonce: "n", isDev: true, supabaseUrl: SUPABASE }),
      policy,
    ]) {
      for (const directive of value.split(";")) {
        assert.ok(
          !(directive.includes("nonce-") && directive.includes("'unsafe-inline'")),
          `both in: ${directive.trim()}`,
        );
      }
    }
  });

  it("uses 'unsafe-inline' for styles in development and a nonce in production", () => {
    const dev = buildCsp({ nonce: "n", isDev: true, supabaseUrl: SUPABASE });
    assert.match(dev, /style-src 'self' 'unsafe-inline'/);
    assert.match(policy, /style-src 'self' 'nonce-abc123'/);
  });

  it("upgrades insecure requests in production only", () => {
    assert.match(policy, /upgrade-insecure-requests/);
    assert.ok(
      !buildCsp({ nonce: "n", isDev: true, supabaseUrl: SUPABASE }).includes(
        "upgrade-insecure-requests",
      ),
      "a local http dev server must not be upgraded",
    );
  });

  it("stays valid when Supabase is not configured", () => {
    const bare = buildCsp({ nonce: "n", isDev: false, supabaseUrl: null });
    assert.match(bare, /connect-src 'self'/);
    assert.ok(!bare.includes("undefined"), bare);
    assert.ok(!bare.includes("null"), bare);
  });
});
