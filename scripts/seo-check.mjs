import { chromium } from "playwright";

/**
 * Verifies the metadata that is actually served.
 *
 * Every assertion here is about something a crawler or a social card reads and
 * a human never sees, which is exactly why it rots silently: a canonical that
 * points at the wrong host, a sitemap listing a page behind authentication, or
 * structured data describing a product that no longer matches the page. None
 * of it shows up in a type check or a screenshot.
 *
 * Requires a running server:
 *   npm run dev
 *   npm run test:seo
 *
 * When the build under test is served on a different port from the origin it
 * is configured with, pass both:
 *   BASE_URL=http://localhost:3100 SITE_URL=http://localhost:3000 npm run test:seo
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * The origin the deployment believes it is served from — what
 * `NEXT_PUBLIC_SITE_URL` is set to. Canonicals, the sitemap and auth redirects
 * are all built from it, so a mismatch with the host actually serving is the
 * misconfiguration this check exists to catch. It defaults to BASE_URL, and is
 * set separately only when testing a build on a different port.
 */
const SITE_URL = (process.env.SITE_URL ?? BASE_URL).replace(/\/$/, "");

let failures = 0;

function check(condition, passed, failed) {
  if (condition) {
    console.log(`  ok   ${passed}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${failed ?? passed}`);
  }
}

const text = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, body: await response.text(), response };
};

// --- robots -------------------------------------------------------------------

const robots = await text("/robots.txt");
check(robots.status === 200, "robots.txt is served");
check(/Sitemap:/i.test(robots.body), "robots.txt points at the sitemap");
check(
  robots.body.includes(`Sitemap: ${SITE_URL}/sitemap.xml`),
  "the sitemap URL in robots.txt matches the configured origin",
  `robots.txt advertises a sitemap somewhere other than ${SITE_URL}`,
);

for (const path of ["/dashboard", "/admin", "/tools/", "/shell-preview"]) {
  check(
    robots.body.includes(`Disallow: ${path}`),
    `robots.txt disallows ${path}`,
  );
}

// --- sitemap ------------------------------------------------------------------

const sitemap = await text("/sitemap.xml");
check(sitemap.status === 200, "sitemap.xml is served");

for (const path of ["/pricing", "/academic-integrity", "/privacy", "/terms"]) {
  check(sitemap.body.includes(path), `the sitemap lists ${path}`);
}

// A sitemap that advertises a page nobody can read is an invitation to try it.
for (const path of ["/dashboard", "/admin", "/settings", "/billing", "/shell-preview"]) {
  check(
    !sitemap.body.includes(`<loc>${SITE_URL}${path}`),
    `the sitemap does not advertise ${path}`,
  );
}

// --- manifest and security.txt ------------------------------------------------

const manifest = await text("/manifest.webmanifest");
check(manifest.status === 200, "the web manifest is served");
check(/"name"/.test(manifest.body), "the manifest names the application");

const security = await text("/.well-known/security.txt");
check(security.status === 200, "security.txt is served at the RFC path");
check(/^Contact: mailto:/m.test(security.body), "security.txt gives a contact");

const expires = security.body.match(/^Expires: (.+)$/m)?.[1];
check(
  Boolean(expires) && new Date(expires).getTime() > Date.now(),
  `security.txt has not expired (${expires ?? "no value"})`,
);

// --- per-page metadata --------------------------------------------------------

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

const PUBLIC_PAGES = ["/", "/pricing", "/academic-integrity", "/privacy", "/terms"];

for (const path of PUBLIC_PAGES) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });

  const meta = await page.evaluate(() => ({
    title: document.title,
    description: document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content"),
    canonical: document
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href"),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ogTitle: document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content"),
    ogImage: document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content"),
    h1Count: document.querySelectorAll("h1").length,
  }));

  check(Boolean(meta.title) && meta.title.length > 10, `${path} has a title`);
  check(
    Boolean(meta.description) && meta.description.length > 40,
    `${path} has a description`,
  );
  check(Boolean(meta.canonical), `${path} declares a canonical URL`);
  // The root's canonical is the bare origin, with or without a trailing
  // slash; both are correct and Next emits the bare form.
  const expected = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  const canonicalMatches =
    meta.canonical === expected || meta.canonical === `${expected}/`;

  check(
    canonicalMatches,
    `${path} canonical points at itself`,
    `${path} canonical is ${meta.canonical}, expected ${expected} — ` +
      "NEXT_PUBLIC_SITE_URL is probably wrong for this deployment",
  );
  check(meta.h1Count === 1, `${path} has exactly one h1 (${meta.h1Count})`);
  check(Boolean(meta.ogTitle), `${path} has an Open Graph title`);
  check(Boolean(meta.ogImage), `${path} has an Open Graph image`);
  check(
    !/noindex/.test(meta.robots ?? ""),
    `${path} is indexable (${meta.robots ?? "no directive"})`,
  );

  await context.close();
}

// A page behind authentication must say noindex even though robots disallows it:
// a URL that leaked into an index is removed by the header, not the crawl rule.
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  const robotsMeta = await page.evaluate(
    () => document.querySelector('meta[name="robots"]')?.getAttribute("content"),
  );
  check(
    /noindex/.test(robotsMeta ?? ""),
    `the sign-in page is marked noindex (${robotsMeta ?? "no directive"})`,
  );
  await context.close();
}

// --- structured data ----------------------------------------------------------

{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

  const blocks = await page.$$eval(
    'script[type="application/ld+json"]',
    (nodes) => nodes.map((node) => node.textContent ?? ""),
  );

  check(blocks.length >= 3, `the landing page emits structured data (${blocks.length})`);

  let parsed = [];
  try {
    parsed = blocks.map((block) => JSON.parse(block));
    check(true, "every structured-data block is valid JSON");
  } catch (error) {
    check(false, "every structured-data block is valid JSON", String(error));
  }

  const types = parsed.map((entry) => entry["@type"]);
  for (const type of ["Organization", "SoftwareApplication", "FAQPage"]) {
    check(types.includes(type), `structured data describes ${type}`);
  }

  // Markup that answers a question the page does not is a penalty, not a win.
  const faq = parsed.find((entry) => entry["@type"] === "FAQPage");
  const bodyText = await page.locator("body").innerText();
  const everyQuestionOnPage = (faq?.mainEntity ?? []).every((entry) =>
    bodyText.includes(entry.name),
  );
  check(
    everyQuestionOnPage,
    "every question in the FAQ markup is actually on the page",
  );

  await context.close();
}

await browser.close();

console.log(failures === 0 ? "\nSEO checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
