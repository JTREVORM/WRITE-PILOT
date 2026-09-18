import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { greetingFor } from "../src/lib/utils/greeting.ts";

// 09:00 UTC. Deliberately a moment that lands in a different part of the day
// depending on where the reader is.
const MORNING_UTC = new Date("2025-06-15T09:00:00Z");

describe("greetingFor", () => {
  it("greets by the user's timezone, not the server's", () => {
    // 09:00 UTC is 18:00 in Tokyo — evening for them, morning for the server.
    assert.equal(
      greetingFor("Ada", "Asia/Tokyo", MORNING_UTC),
      "Good evening, Ada",
    );
    assert.equal(
      greetingFor("Ada", "Europe/London", MORNING_UTC),
      "Good morning, Ada",
    );
    assert.equal(
      greetingFor("Ada", "America/Los_Angeles", MORNING_UTC),
      "Good morning, Ada",
    );
  });

  it("uses only the first name", () => {
    assert.equal(
      greetingFor("Ada Lovelace", "UTC", MORNING_UTC),
      "Good morning, Ada",
    );
  });

  it("omits the name when there isn't one", () => {
    assert.equal(greetingFor(null, "UTC", MORNING_UTC), "Good morning");
    assert.equal(greetingFor("   ", "UTC", MORNING_UTC), "Good morning");
  });

  it("falls back to UTC rather than throwing on a bad timezone", () => {
    assert.equal(
      greetingFor("Ada", "Not/A_Zone", MORNING_UTC),
      "Good morning, Ada",
    );
  });

  it("uses the right greeting at each boundary", () => {
    assert.equal(
      greetingFor(null, "UTC", new Date("2025-06-15T11:59:00Z")),
      "Good morning",
    );
    assert.equal(
      greetingFor(null, "UTC", new Date("2025-06-15T12:00:00Z")),
      "Good afternoon",
    );
    assert.equal(
      greetingFor(null, "UTC", new Date("2025-06-15T17:59:00Z")),
      "Good afternoon",
    );
    assert.equal(
      greetingFor(null, "UTC", new Date("2025-06-15T18:00:00Z")),
      "Good evening",
    );
  });

  it("handles midnight, which some zones format as hour 24", () => {
    assert.equal(
      greetingFor(null, "UTC", new Date("2025-06-15T00:00:00Z")),
      "Good morning",
    );
  });
});
