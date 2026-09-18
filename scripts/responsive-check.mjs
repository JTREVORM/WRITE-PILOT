import { chromium } from "playwright";

/**
 * Drives a real browser across viewports and both colour themes, checking for
 * the failures that only show up when the page is actually rendered:
 * horizontal overflow (the classic "shrunk desktop layout" symptom), console
 * errors, and React hydration problems.
 *
 * Run against a dev or preview server:
 *   node scripts/responsive-check.mjs
 *   BASE_URL=http://localhost:3001 EXTRA_PATHS=/shell-preview node scripts/responsive-check.mjs
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? "/var/tmp/wp-shots";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const THEMES = ["light", "dark"];

const PAGES = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "privacy", path: "/privacy" },
  ...(process.env.EXTRA_PATHS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ name: p.replace(/^\//, "").replace(/\//g, "-") || "root", path: p })),
];

/**
 * In dev, Next forwards server-side console output into the browser console.
 * Our own graceful-degradation logs (an unreachable Supabase in a sandbox, for
 * instance) are therefore indistinguishable from client errors unless we say so
 * here. Anything not matching this list still fails the run.
 */
const SERVER_LOG_PREFIXES = [
  "[entitlements]",
  "[notifications]",
  "[usage]",
  "[auth]",
  "[profile]",
  "[provisioning]",
  "[email]",
];

const isForwardedServerLog = (text) =>
  SERVER_LOG_PREFIXES.some((prefix) => text.includes(prefix));

const browser = await chromium.launch({
  // The preinstalled Chromium build differs from this Playwright version's
  // expected revision, so point at it explicitly.
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

let failures = 0;
const origin = new URL(BASE_URL).origin;

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      colorScheme: theme,
    });

    // The server renders the palette from this cookie, so the check exercises
    // the real no-flash path rather than only the media query.
    await context.addCookies([
      { name: "wp-theme", value: theme, url: origin },
    ]);

    const page = await context.newPage();
    const consoleErrors = [];
    const serverLogs = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      (isForwardedServerLog(text) ? serverLogs : consoleErrors).push(text);
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    for (const target of PAGES) {
      const response = await page.goto(`${BASE_URL}${target.path}`, {
        waitUntil: "networkidle",
      });

      if (!response || response.status() >= 400) {
        failures++;
        console.log(
          `  FAIL ${theme}/${viewport.name}/${target.name}: HTTP ${response?.status()}`,
        );
        continue;
      }

      const result = await page.evaluate(() => {
        const de = document.documentElement;
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          theme: de.getAttribute("data-theme"),
          background: getComputedStyle(document.body).backgroundColor,
          offenders: [...document.querySelectorAll("*")]
            .filter((el) => el.getBoundingClientRect().right > de.clientWidth + 1)
            .slice(0, 5)
            .map(
              (el) =>
                `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`,
            ),
        };
      });

      if (result.scrollWidth > result.clientWidth + 1) {
        failures++;
        console.log(
          `  FAIL ${theme}/${viewport.name}/${target.name}: horizontal overflow ` +
            `(${result.scrollWidth} > ${result.clientWidth})`,
          result.offenders,
        );
      } else if (result.theme !== theme) {
        failures++;
        console.log(
          `  FAIL ${theme}/${viewport.name}/${target.name}: served data-theme="${result.theme}"`,
        );
      } else {
        console.log(`  ok   ${theme}/${viewport.name}/${target.name}`);
      }

      await page.screenshot({
        path: `${SHOT_DIR}/${target.name}-${viewport.name}-${theme}.png`,
        fullPage: viewport.name === "desktop",
      });
    }

    if (consoleErrors.length) {
      failures++;
      console.log(
        `  FAIL ${theme}/${viewport.name}: console errors`,
        consoleErrors.slice(0, 5).map((t) => t.slice(0, 200)),
      );
    } else {
      console.log(
        `  ok   ${theme}/${viewport.name} — no client console errors` +
          (serverLogs.length
            ? ` (${serverLogs.length} forwarded server log${serverLogs.length === 1 ? "" : "s"} ignored)`
            : ""),
      );
    }

    await context.close();
  }
}

await browser.close();
console.log(
  failures === 0
    ? "\nResponsive checks passed (light + dark)."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
