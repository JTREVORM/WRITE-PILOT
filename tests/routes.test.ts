import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAdminRoute,
  isAuthOnlyRoute,
  isProtectedRoute,
  routes,
  safeRedirectPath,
} from "../src/lib/config/routes.ts";

describe("route classification", () => {
  it("protects the application areas", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/anything",
      "/documents",
      "/usage",
      "/billing",
      "/settings",
      "/settings/security",
      "/admin",
      "/admin/users",
    ]) {
      assert.equal(isProtectedRoute(path), true, `${path} should be protected`);
    }
  });

  it("leaves public pages open", () => {
    for (const path of ["/", "/pricing", "/privacy", "/terms", "/login", "/register"]) {
      assert.equal(isProtectedRoute(path), false, `${path} should be public`);
    }
  });

  it("does not treat a lookalike prefix as a protected route", () => {
    // "/settings-guide" starts with "/settings" as a string but is a different
    // route, and must not inherit its protection (or lack of it).
    assert.equal(isProtectedRoute("/settings-guide"), false);
    assert.equal(isProtectedRoute("/dashboards"), false);
  });

  it("identifies admin routes", () => {
    assert.equal(isAdminRoute("/admin"), true);
    assert.equal(isAdminRoute("/admin/users"), true);
    assert.equal(isAdminRoute("/dashboard"), false);
  });

  it("identifies pages that only make sense signed out", () => {
    assert.equal(isAuthOnlyRoute(routes.login), true);
    assert.equal(isAuthOnlyRoute(routes.register), true);
    assert.equal(isAuthOnlyRoute(routes.forgotPassword), true);
    // Reset-password needs a session established by the recovery link, so it is
    // deliberately not in this set.
    assert.equal(isAuthOnlyRoute(routes.resetPassword), false);
  });
});

describe("safeRedirectPath", () => {
  it("keeps a same-site absolute path", () => {
    assert.equal(safeRedirectPath("/documents/42"), "/documents/42");
  });

  it("falls back when nothing is supplied", () => {
    assert.equal(safeRedirectPath(null), routes.dashboard);
    assert.equal(safeRedirectPath(undefined), routes.dashboard);
    assert.equal(safeRedirectPath(""), routes.dashboard);
  });

  it("rejects absolute URLs to other origins", () => {
    assert.equal(safeRedirectPath("https://evil.example.com"), routes.dashboard);
    assert.equal(safeRedirectPath("http://evil.example.com/x"), routes.dashboard);
  });

  it("rejects protocol-relative URLs", () => {
    // "//evil.example.com" is a same-protocol absolute URL, not a local path.
    assert.equal(safeRedirectPath("//evil.example.com"), routes.dashboard);
  });

  it("rejects backslash tricks some browsers normalise to slashes", () => {
    assert.equal(safeRedirectPath("/\\evil.example.com"), routes.dashboard);
    assert.equal(safeRedirectPath("\\\\evil.example.com"), routes.dashboard);
  });

  it("honours a caller-supplied fallback", () => {
    assert.equal(safeRedirectPath("https://evil.example.com", "/login"), "/login");
  });
});
