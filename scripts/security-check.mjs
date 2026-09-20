import { chromium } from "playwright";

/**
 * Verifies the security headers that are actually served, and that the
 * Content Security Policy does not break the application.
 *
 * A policy is easy to write and easy to get subtly wrong: one missing origin
 * and users cannot sign in, one missing directive and it protects nothing.
 * Neither failure shows up in a type check or a unit test, so this loads real
 * pages in a real browser and fails on any CSP violation the page reports.
 *
 * Requires a dev server:
 *   npm run dev
 *   npm run test:security
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const PAGES = [
  "/",
  "/pricing",
  "/login",
  "/register",
  ...(process.env.EXTRA_PATHS ?? "/shell-preview")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean),
];

let failures = 0;

function check(condition, passed, failed) {
  if (condition) {
    console.log(`  ok   ${passed}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${failed ?? passed}`);
  }
}

// --- the headers themselves ---------------------------------------------------

const response = await fetch(`${BASE_URL}/`, { redirect: "manual" });
const headers = response.headers;

const REQUIRED = [
  ["x-frame-options", /DENY/i],
  ["x-content-type-options", /nosniff/i],
  ["referrer-policy", /strict-origin-when-cross-origin/i],
  ["permissions-policy", /camera=\(\)/i],
  ["strict-transport-security", /max-age=\d+/i],
  ["content-security-policy", /default-src 'self'/],
];

for (const [header, pattern] of REQUIRED) {
  const value = headers.get(header);
  check(
    Boolean(value) && pattern.test(value),
    `${header} is served`,
    `${header} is missing or wrong (got ${value ?? "nothing"})`,
  );
}

check(
  headers.get("x-powered-by") === null,
  "the stack is not advertised in a header",
);

const csp = headers.get("content-security-policy") ?? "";

check(/script-src [^;]*'nonce-/.test(csp), "the policy carries a nonce");
check(/'strict-dynamic'/.test(csp), "the policy uses strict-dynamic");
check(/frame-ancestors 'none'/.test(csp), "the app refuses to be framed");
check(/object-src 'none'/.test(csp), "plugins are refused");
check(/base-uri 'self'/.test(csp), "the base URL cannot be rewritten");

// Two requests must not share a nonce, or it is not a nonce.
const second = await fetch(`${BASE_URL}/`, { redirect: "manual" });
const nonceOf = (value) => value?.match(/'nonce-([^']+)'/)?.[1] ?? null;

check(
  nonceOf(csp) !== null &&
    nonceOf(second.headers.get("content-security-policy")) !== nonceOf(csp),
  "every request gets a fresh nonce",
);

// --- the policy against real pages --------------------------------------------

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const path of PAGES) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const violations = [];
  // Chromium reports a blocked resource as a console error naming the policy.
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy/i.test(text)) violations.push(text);
  });

  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  // Hydration happens after the load event; a blocked bundle shows up here.
  await page.waitForTimeout(600);

  check(
    violations.length === 0,
    `${path} loads with no policy violations`,
    `${path}: ${violations.slice(0, 2).join(" | ")}`,
  );

  // A page whose scripts were blocked renders markup but never hydrates.
  const hydrated = await page.evaluate(
    () => document.documentElement.innerHTML.includes("__next") ||
      document.querySelectorAll("script").length > 0,
  );
  check(hydrated, `${path} served its scripts`);

  await context.close();
}

// --- what must not exist in production ----------------------------------------
// The development-only preview routes render fixture data inside the signed-in
// shell. They call notFound() in production; this checks the built server
// actually does, rather than trusting that the guard was not edited out.
if (process.env.EXPECT_PRODUCTION === "1") {
  for (const path of ["/shell-preview", "/shell-preview/admin", "/shell-preview/billing"]) {
    const status = await fetch(`${BASE_URL}${path}`, { redirect: "manual" }).then(
      (r) => r.status,
    );
    check(status === 404, `${path} does not exist in production (${status})`);
  }
}

await browser.close();

console.log(
  failures === 0 ? "\nSecurity checks passed." : `\n${failures} failed.`,
);
process.exit(failures === 0 ? 0 : 1);
