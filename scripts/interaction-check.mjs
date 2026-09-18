import { chromium } from "playwright";

/**
 * Exercises the interactive parts of the application shell in a real browser.
 *
 * These live behind authentication, so they are driven against the development
 * shell-preview route rather than a live session. Two bugs that unit tests and
 * the type checker both passed were caught here: a component reference crossing
 * the server/client boundary, and the mobile drawer being clipped by the
 * header's backdrop filter.
 *
 * Requires a dev server:
 *   npm run dev
 *   npm run test:interaction
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TARGET = `${BASE_URL}${process.env.SHELL_PATH ?? "/shell-preview"}`;
const SHOT_DIR = process.env.SHOT_DIR ?? "/var/tmp/wp-shots";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
let failures = 0;
function ok(message) {
  console.log(`  ok   ${message}`);
}

function fail(message) {
  failures += 1;
  console.log(`  FAIL ${message}`);
}

/** Asserts a condition, printing the right message either way. */
function check(condition, passed, failed) {
  if (condition) {
    ok(passed);
  } else {
    fail(failed ?? passed);
  }
}

// --- mobile navigation drawer -------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(TARGET, { waitUntil: "networkidle" });

  // The desktop sidebar also renders nav[aria-label="Main"] (hidden at this
  // width), so the drawer is identified by its own close button instead.
  const drawerBefore = await page.locator('button[aria-label="Close navigation menu"]').count();
  await page.click('button[aria-label="Open navigation menu"]');
  await page.waitForTimeout(400);

  const drawerVisible = await page
    .locator('button[aria-label="Close navigation menu"]')
    .first()
    .isVisible();
  check(

    drawerVisible,

    "mobile drawer opens",

    "mobile drawer did not open",

  );

  const iconCount = await page.locator('nav[aria-label="Main"]').last().locator("svg").count();
  check(

    iconCount > 5,

    `drawer renders nav icons (${iconCount}) — icon registry serializes correctly`,

    `drawer rendered only ${iconCount} icons`,

  );

  await page.screenshot({ path: `${SHOT_DIR}/drawer-mobile.png` });

  // Escape closes it.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const stillOpen = await page
    .locator('button[aria-label="Close navigation menu"]')
    .count() > 0;
  check(

    !stillOpen,

    "Escape closes the drawer",

    "Escape did not close the drawer",

  );

  check(


    errors.length === 0,


    "no uncaught client errors in the drawer",


    `client errors: ${errors.slice(0, 2).join(" | ")}`,


  );

  check(


    drawerBefore === 0,


    "drawer is closed on first paint",


    "drawer was already open before interaction",


  );
  await ctx.close();
}

// --- notification menu --------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(TARGET, { waitUntil: "networkidle" });

  await page.click('button[aria-label^="Notifications"]');
  await page.waitForTimeout(300);

  const menuVisible = await page.locator('[role="menu"][aria-label="Notifications"]').isVisible();
  check(

    menuVisible,

    "notification menu opens",

    "notification menu did not open",

  );

  const emptyText = await page.locator('[role="menu"][aria-label="Notifications"]').innerText();
  check(

    emptyText.includes("caught up"),

    "notification menu shows its empty state",

    `unexpected menu content: ${emptyText.slice(0, 60)}`,

  );

  await page.screenshot({ path: `${SHOT_DIR}/notifications-desktop.png` });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const closed = !(await page.locator('[role="menu"][aria-label="Notifications"]').isVisible());
  check(

    closed,

    "Escape closes the notification menu",

    "Escape did not close the menu",

  );

  check(


    errors.length === 0,


    "no uncaught client errors in the notification menu",


    `client errors: ${errors.slice(0, 2).join(" | ")}`,


  );
  await ctx.close();
}

// --- theme toggle -------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: "networkidle" });

  await page.locator('[role="radiogroup"][aria-label="Colour theme"] button').first().click();
  await page.waitForTimeout(400);
  const attr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check(

    attr === "light",

    "theme toggle applies light immediately",

    `expected data-theme="light", got "${attr}"`,

  );

  await page.locator('[role="radiogroup"][aria-label="Colour theme"] button').nth(1).click();
  await page.waitForTimeout(400);
  const dark = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check(

    dark === "dark",

    "theme toggle applies dark immediately",

    `expected data-theme="dark", got "${dark}"`,

  );

  // The choice must survive a reload, which proves the cookie was persisted and
  // the server rendered from it.
  await page.reload({ waitUntil: "networkidle" });
  const persisted = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  check(

    persisted === "dark",

    "theme choice persists across a reload (server-rendered, no flash)",

    `theme did not persist, got "${persisted}"`,

  );

  await ctx.close();
}

// --- skip link ----------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(TARGET, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check(

    focused === "Skip to content",

    "skip link is the first tab stop",

    `first tab stop was "${focused}"`,

  );
  await ctx.close();
}

// --- detection scan form gating ----------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE_URL}${process.env.DETECTION_PATH ?? "/shell-preview/detection"}`, {
    waitUntil: "networkidle",
  });

  const submit = page.locator('button[type="submit"]');
  const textarea = page.locator('textarea[name="text"]');

  check(
    await submit.isDisabled(),
    "scan submit starts disabled with no input",
  );

  // Under the 50-word minimum: still refused, and the shortfall is named.
  await textarea.fill("Too short to analyse meaningfully.");
  await page.waitForTimeout(200);
  check(
    await submit.isDisabled(),
    "scan submit stays disabled below the word minimum",
  );
  const shortNotice = await page.locator("form").innerText();
  check(
    /needed/i.test(shortNotice),
    "the form says how many more words are needed",
  );

  // Comfortably over the minimum: enabled.
  await textarea.fill(("sentence number one here ").repeat(30));
  await page.waitForTimeout(200);
  check(
    await submit.isEnabled(),
    "scan submit enables once the text is long enough",
  );

  // Over the plan's per-run word cap: refused again.
  await textarea.fill(("word ").repeat(2000));
  await page.waitForTimeout(250);
  check(
    await submit.isDisabled(),
    "scan submit disables when the text exceeds the plan word limit",
  );
  check(
    /over your plan limit/i.test(await page.locator("form").innerText()),
    "the form explains that the text is over the plan limit",
  );

  check(
    (await page.locator('[role="meter"]').count()) > 0,
    "the likelihood meter renders with a meter role",
  );
  check(
    /not proof of authorship/i.test(await page.locator("body").innerText()),
    "the false-positive disclaimer is present on the result view",
  );

  check(errors.length === 0, "no uncaught client errors on the detection view",
    `client errors: ${errors.slice(0, 2).join(" | ")}`);

  await page.screenshot({ path: `${SHOT_DIR}/detection-form.png` });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nInteraction checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
