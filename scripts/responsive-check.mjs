import { chromium } from "playwright";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const PAGES = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "privacy", path: "/privacy" },
];

const browser = await chromium.launch({
  // The preinstalled Chromium build differs from this Playwright version's
  // expected revision, so point at it explicitly.
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
let failures = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  for (const target of PAGES) {
    await page.goto(`http://localhost:3000${target.path}`, {
      waitUntil: "networkidle",
    });

    // Horizontal overflow is the classic "shrunk desktop layout" symptom.
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        offenders: [...document.querySelectorAll("*")]
          .filter((el) => el.getBoundingClientRect().right > de.clientWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`),
      };
    });

    const overflows = overflow.scrollWidth > overflow.clientWidth + 1;
    if (overflows) {
      failures++;
      console.log(
        `  FAIL ${viewport.name}/${target.name}: horizontal overflow ` +
          `(${overflow.scrollWidth} > ${overflow.clientWidth})`,
        overflow.offenders,
      );
    } else {
      console.log(`  ok   ${viewport.name}/${target.name} — no horizontal overflow`);
    }

    await page.screenshot({
      path: `/var/tmp/wp-shots/${target.name}-${viewport.name}.png`,
      fullPage: viewport.name === "desktop",
    });
  }

  if (consoleErrors.length) {
    failures++;
    console.log(`  FAIL ${viewport.name}: console errors`, consoleErrors.slice(0, 5));
  } else {
    console.log(`  ok   ${viewport.name} — no console errors`);
  }

  await context.close();
}

// Touch-target check on the mobile login form.
const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await context.newPage();
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
const small = await page.evaluate(() =>
  [...document.querySelectorAll("button, a, input, select")]
    .map((el) => ({ tag: el.tagName, rect: el.getBoundingClientRect() }))
    .filter((e) => e.rect.height > 0 && e.rect.height < 32)
    .map((e) => `${e.tag} h=${Math.round(e.rect.height)}`),
);
console.log(
  small.length
    ? `  note  controls under 32px tall on mobile: ${small.join(", ")}`
    : "  ok   all mobile controls are at least 32px tall",
);
await context.close();

await browser.close();
console.log(failures === 0 ? "\nResponsive checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
