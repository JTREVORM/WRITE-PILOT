import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isEntitledStatus,
  isHandledEvent,
  mapBillingInterval,
  mapSubscriptionStatus,
  toIsoTimestamp,
} from "../src/lib/billing/status.ts";

/**
 * This module is the join between the provider's vocabulary and ours, which is
 * exactly where a drift becomes a user with credits they did not buy. The bias
 * is conservative everywhere, and these tests pin that.
 */

describe("mapSubscriptionStatus", () => {
  it("maps the statuses that mean the same thing", () => {
    assert.equal(mapSubscriptionStatus("active"), "active");
    assert.equal(mapSubscriptionStatus("trialing"), "trialing");
    assert.equal(mapSubscriptionStatus("canceled"), "canceled");
  });

  it("treats unpaid as past due rather than as cancelled", () => {
    assert.equal(mapSubscriptionStatus("unpaid"), "past_due");
  });

  it("maps an expired incomplete subscription to expired", () => {
    assert.equal(mapSubscriptionStatus("incomplete_expired"), "expired");
  });

  it("falls back to a status that grants nothing", () => {
    for (const unknown of ["something_new", "", null, undefined]) {
      const mapped = mapSubscriptionStatus(unknown);
      assert.equal(mapped, "incomplete", `${unknown} should not grant`);
      assert.equal(isEntitledStatus(mapped), false);
    }
  });
});

describe("isEntitledStatus", () => {
  it("entitles only a live subscription", () => {
    assert.equal(isEntitledStatus("active"), true);
    assert.equal(isEntitledStatus("trialing"), true);
  });

  it("does not entitle one that has stopped being paid for", () => {
    for (const status of ["past_due", "paused", "canceled", "incomplete", "expired"] as const) {
      assert.equal(isEntitledStatus(status), false, status);
    }
  });
});

describe("mapBillingInterval", () => {
  it("reads an annual price as annual", () => {
    assert.equal(mapBillingInterval("year", 1), "year");
    assert.equal(mapBillingInterval("month", 12), "year");
  });

  it("reads a monthly price as monthly", () => {
    assert.equal(mapBillingInterval("month", 1), "month");
  });

  it("treats anything unexpected as monthly, the cheaper mistake", () => {
    assert.equal(mapBillingInterval("week", 1), "month");
    assert.equal(mapBillingInterval("day", 30), "month");
    assert.equal(mapBillingInterval(null), "month");
    assert.equal(mapBillingInterval("year", 2), "month");
  });
});

describe("toIsoTimestamp", () => {
  it("converts provider seconds to an instant", () => {
    assert.equal(toIsoTimestamp(1_700_000_000), "2023-11-14T22:13:20.000Z");
  });

  it("returns null for anything that is not a usable timestamp", () => {
    for (const value of [null, undefined, 0, -1, Number.NaN]) {
      assert.equal(toIsoTimestamp(value), null, String(value));
    }
  });
});

describe("isHandledEvent", () => {
  it("recognises the events the endpoint acts on", () => {
    assert.equal(isHandledEvent("checkout.session.completed"), true);
    assert.equal(isHandledEvent("invoice.paid"), true);
    assert.equal(isHandledEvent("customer.subscription.deleted"), true);
  });

  it("does not claim events it has no handler for", () => {
    assert.equal(isHandledEvent("invoice.payment_failed"), false);
    assert.equal(isHandledEvent("charge.refunded"), false);
  });
});
