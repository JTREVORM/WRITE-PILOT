import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_THEME,
  THEMES,
  isTheme,
  themeAttribute,
} from "../src/lib/theme/constants.ts";

describe("theme constants", () => {
  it("defaults to following the system", () => {
    assert.equal(DEFAULT_THEME, "system");
  });

  it("accepts only the known themes", () => {
    for (const theme of THEMES) {
      assert.equal(isTheme(theme), true, `${theme} should be valid`);
    }
  });

  it("rejects anything else, including tampered cookie values", () => {
    for (const value of ["", "DARK", "blue", null, undefined, 1, {}, []]) {
      assert.equal(isTheme(value), false, `${String(value)} should be rejected`);
    }
  });
});

describe("themeAttribute", () => {
  it("renders an explicit choice as the attribute value", () => {
    assert.equal(themeAttribute("light"), "light");
    assert.equal(themeAttribute("dark"), "dark");
  });

  it("renders nothing for system, deferring to the media query", () => {
    // The server cannot know the visitor's OS preference, so it must not guess.
    assert.equal(themeAttribute("system"), undefined);
  });
});
