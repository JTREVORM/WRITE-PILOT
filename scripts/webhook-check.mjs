import { createHmac } from "node:crypto";

/**
 * Exercises the payment webhook endpoint's signature verification.
 *
 * This is the only route in the application that can change what a user is
 * entitled to with no session behind it, so what it refuses matters more than
 * what it accepts. Four cases: unsigned, signed with the wrong secret, signed
 * with a stale timestamp (a captured delivery replayed later), and signed
 * correctly.
 *
 * Verification is an HMAC over the request body and touches no network, so
 * this runs fully locally — no payment provider account, no API key. It caught
 * a real bug: verification was routed through the API client, so a deployment
 * with a signing secret but no API key rejected every genuine delivery.
 *
 * Requires a dev server started with the same STRIPE_WEBHOOK_SECRET:
 *   STRIPE_WEBHOOK_SECRET=whsec_… npm run dev
 *   STRIPE_WEBHOOK_SECRET=whsec_… npm run test:webhook
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/webhooks/stripe`;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!SECRET) {
  console.log(
    "STRIPE_WEBHOOK_SECRET is not set — skipping.\n" +
      "Set it to the same value the dev server was started with.",
  );
  process.exit(0);
}

let failures = 0;

function check(condition, passed, failed) {
  if (condition) {
    console.log(`  ok   ${passed}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${failed ?? passed}`);
  }
}

/** The signature header, built the way the provider builds it. */
function sign(body, secret, timestamp) {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return `t=${timestamp},v1=${digest}`;
}

const payload = JSON.stringify({
  id: `evt_check_${Date.now()}`,
  object: "event",
  // A type the endpoint records and deliberately does not act on, so a run of
  // this check never touches an account's entitlements.
  type: "invoice.payment_failed",
  data: { object: { id: "in_check", object: "invoice" } },
});

async function post(headers) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });

  return response.status;
}

const now = Math.floor(Date.now() / 1000);

const status = await fetch(ENDPOINT).then((r) => r.json());
check(
  status.configured === true,
  "the endpoint reports itself as configured",
  "the dev server has no signing secret — start it with the same one",
);

check(
  (await post({})) === 400,
  "an unsigned delivery is refused",
);

check(
  (await post({ "stripe-signature": sign(payload, "whsec_wrong_secret", now) })) === 400,
  "a delivery signed with the wrong secret is refused",
);

check(
  (await post({ "stripe-signature": sign(payload, SECRET, now - 3600) })) === 400,
  "a correctly signed delivery replayed an hour later is refused",
);

check(
  (await post({ "stripe-signature": sign(payload, SECRET, now) })) === 200,
  "a correctly signed delivery is accepted",
);

console.log(
  failures === 0 ? "\nWebhook checks passed." : `\n${failures} failed.`,
);
process.exit(failures === 0 ? 0 : 1);
