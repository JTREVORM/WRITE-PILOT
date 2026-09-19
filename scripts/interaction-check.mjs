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

// --- grammar workspace --------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE_URL}${process.env.GRAMMAR_PATH ?? "/shell-preview/grammar"}`, {
    waitUntil: "networkidle",
  });

  // The marks are produced from offsets the real locating pipeline computed.
  const markCount = await page.locator("mark").count();
  check(markCount === 4, `all four suggestions are marked inline (got ${markCount})`);

  const marks = await page.locator("mark").allInnerTexts();
  check(
    marks.includes("are") && marks.includes("The the"),
    `marks land on the right fragments (got ${JSON.stringify(marks)})`,
  );

  const cards = await page.locator("ul li").filter({ hasText: "Accept" }).count();
  check(cards === 4, `every suggestion has a card (got ${cards})`);

  check(
    /4\s*open/i.test(await page.locator("body").innerText()),
    "the toolbar counts the open suggestions",
  );

  // Severity filtering is pure client state.
  await page.getByRole("button", { name: /^Correction/ }).click();
  await page.waitForTimeout(200);
  const filtered = await page.locator("ul li").filter({ hasText: "Accept" }).count();
  check(
    filtered === 2,
    `filtering to corrections narrows the list (got ${filtered}, expected 2)`,
  );

  await page.getByRole("button", { name: /^All/ }).click();
  await page.waitForTimeout(200);
  check(
    (await page.locator("ul li").filter({ hasText: "Accept" }).count()) === 4,
    "clearing the filter restores the full list",
  );

  check(
    /Reading ease|readability/i.test(await page.locator("body").innerText()),
    "the readability panel renders",
  );

  check(errors.length === 0, "no uncaught client errors in the grammar workspace",
    `client errors: ${errors.slice(0, 2).join(" | ")}`);

  await page.screenshot({ path: `${SHOT_DIR}/grammar-workspace.png`, fullPage: true });
  await ctx.close();
}

// --- naturalize comparison ----------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${BASE_URL}${process.env.NATURALIZE_PATH ?? "/shell-preview/naturalize"}`,
    { waitUntil: "networkidle" },
  );

  const body = await page.locator("body").innerText();

  // The fixture drops a citation, so the real integrity check must report it.
  check(
    /1 thing to check/i.test(body),
    "the integrity panel reports the dropped citation",
  );
  check(
    /Walker et al\., 2007/.test(body),
    "the finding names the citation that went missing",
  );

  // The diff is produced by the real word-level algorithm.
  check(
    (await page.locator("del").count()) > 0 &&
      (await page.locator("ins").count()) > 0,
    "removals and additions are both marked",
  );
  check(
    (await page.locator("del").allInnerTexts()).some((t) => /In order/.test(t)),
    "a removal lands on the padding that was cut",
  );

  // Removals use strikethrough and additions a background, so the comparison
  // does not depend on telling red from green.
  const delDecoration = await page
    .locator("del")
    .first()
    .evaluate((el) => getComputedStyle(el).textDecorationLine);
  check(
    delDecoration.includes("line-through"),
    `removals carry a non-colour cue (got "${delDecoration}")`,
  );

  // Three views of the same rewrite.
  await page.getByRole("radio", { name: /Side by side/ }).click();
  await page.waitForTimeout(200);
  check(
    /Original[\s\S]*Improved/.test(await page.locator("body").innerText()),
    "side-by-side view shows both versions",
  );

  await page.getByRole("radio", { name: /Improved only/ }).click();
  await page.waitForTimeout(200);
  check(
    (await page.locator("del").count()) === 0,
    "improved-only view drops the diff marks",
  );

  await page.getByRole("radio", { name: /^Changes$/ }).click();
  await page.waitForTimeout(200);
  check(
    (await page.locator("del").count()) > 0,
    "switching back restores the changes view",
  );

  check(errors.length === 0, "no uncaught client errors in the comparison",
    `client errors: ${errors.slice(0, 2).join(" | ")}`);

  await page.screenshot({ path: `${SHOT_DIR}/naturalize-comparison.png`, fullPage: true });
  await ctx.close();
}

// --- grading result -----------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${BASE_URL}${process.env.GRADING_PATH ?? "/shell-preview/grading"}`,
    { waitUntil: "networkidle" },
  );

  const body = await page.locator("body").innerText();

  // The headline is computed by the real totalFor over the fixture's criteria
  // (8 + 16 + 15 of 10 + 20 + 20), so a drift in the arithmetic fails here.
  check(/39\s*\/\s*50/.test(body), "the headline is the sum of the criteria");
  check(/78%/.test(body), "the percentage is shown as the secondary figure");

  // Every framing rule from the brief, asserted on the rendered page rather
  // than on the source string.
  check(
    /AI-assisted estimated grade/i.test(body),
    "the estimate is labelled as AI-assisted, not as a grade",
  );
  check(
    /not an official grade/i.test(body),
    "the disclaimer says plainly that this is not an official grade",
  );
  check(
    /does not predict how your work will be marked/i.test(body),
    "the disclaimer disclaims prediction of the real mark",
  );
  check(
    !/(turnitin|undetectable|bypass|guarantee)/i.test(body),
    "no detector-evasion or guarantee language on the result screen",
  );

  // The band is never colour alone.
  check(
    /Meets most criteria/.test(body),
    "the band ships with a written label beside its colour",
  );
  const meter = page.locator('[role="meter"]').first();
  check(
    (await meter.getAttribute("aria-valuenow")) === "39" &&
      (await meter.getAttribute("aria-valuemax")) === "50",
    "the meter exposes its value to assistive technology",
  );

  // The breakdown is the part a student can act on.
  check(
    /Argument and analysis/.test(body) && /Use of evidence/.test(body),
    "every criterion appears in the breakdown",
  );
  check(
    /counter-position is engaged|evaluated alternative explanation/i.test(body),
    "the breakdown names what the rubric asked for and did not get",
  );

  // The rubric editor: a misread criterion is correctable in place.
  await page.getByRole("button", { name: "Edit Use of evidence" }).click();
  await page.waitForTimeout(200);
  const nameField = page.getByLabel("Criterion name");
  check(
    (await nameField.inputValue()) === "Use of evidence",
    "editing a criterion opens a form prefilled with its current name",
  );
  check(
    (await page.getByLabel("Points").inputValue()) === "20",
    "the points field carries the criterion's allocation",
  );

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(200);
  check(
    (await page.getByLabel("Criterion name").count()) === 0,
    "cancelling closes the editor without saving",
  );

  check(errors.length === 0, "no uncaught client errors on the grading screen",
    `client errors: ${errors.slice(0, 2).join(" | ")}`);

  await page.screenshot({ path: `${SHOT_DIR}/grading-result.png`, fullPage: true });
  await ctx.close();
}

// --- citation check result ----------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${BASE_URL}${process.env.CITATIONS_PATH ?? "/shell-preview/citations"}`,
    { waitUntil: "networkidle" },
  );

  const body = await page.locator("body").innerText();

  // The counts come from the real parser and matcher over the fixture: three
  // works cited, three entries listed, one cited-but-not-listed (Walker), one
  // listed-but-not-cited (Ferreira).
  check(/Cited but not listed/.test(body), "the coverage summary names the gap it found");
  check(
    /Walker/.test(body),
    "the source that is cited and never listed is named",
  );
  check(
    /Ferreira/.test(body),
    "the entry that is listed and never cited is named",
  );
  check(
    /Years disagree/.test(body),
    "a year that disagrees is reported separately from a missing source",
  );

  // The honesty rule this whole screen turns on.
  check(
    /not whether the sources exist/i.test(body),
    "the screen says it does not verify that sources exist",
  );
  check(
    /italics/i.test(body),
    "the screen says what extraction cannot see",
  );
  check(
    !/(turnitin|undetectable|bypass|guarantee)/i.test(body),
    "no evasion or guarantee language on the citation screen",
  );

  // Counted and assessed must stay distinguishable.
  check(
    /Checked/.test(body) && /Assessed/.test(body),
    "counted findings and assessed findings are labelled differently",
  );

  await page.getByRole("radio", { name: /^Checked/ }).click();
  await page.waitForTimeout(200);
  const afterFilter = await page.locator("body").innerText();
  check(
    /comparing your citations against your reference list/i.test(afterFilter),
    "filtering to the counted half explains what that means",
  );
  check(
    !/The article title uses headline capitalisation/.test(afterFilter),
    "filtering to the counted half hides the assessed findings",
  );

  await page.getByRole("radio", { name: /^Assessed/ }).click();
  await page.waitForTimeout(200);
  check(
    /The article title uses headline capitalisation/.test(
      await page.locator("body").innerText(),
    ),
    "filtering to the assessed half shows them again",
  );

  await page.getByRole("radio", { name: /^All/ }).click();
  await page.waitForTimeout(200);

  // Working the report. There is no session behind this preview, so the server
  // action redirects to sign-in; what is asserted here is the optimistic render
  // that must happen first, because a checklist that waits on a round trip
  // before ticking is a checklist nobody trusts.
  const openBefore = (await page.locator("body").innerText()).match(
    /(\d+) of (\d+) still open/,
  );
  check(Boolean(openBefore), "the report says how many findings are still open");

  const target = Number(openBefore?.[1] ?? 0) - 1;
  await page.getByRole("button", { name: "Fixed" }).first().click();

  const ticked = await page
    .waitForFunction(
      (expected) =>
        new RegExp(`${expected} of \\d+ still open`).test(document.body.innerText),
      target,
      { timeout: 3000 },
    )
    .then(() => true)
    .catch(() => false);

  check(
    ticked,
    `marking a finding fixed updates the open count immediately (${openBefore?.[1]} → ${target})`,
  );

  check(errors.length === 0, "no uncaught client errors on the citation screen",
    `client errors: ${errors.slice(0, 2).join(" | ")}`);

  await page.screenshot({ path: `${SHOT_DIR}/citation-check.png`, fullPage: true });
  await ctx.close();
}

// --- workspace ----------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `${BASE_URL}${process.env.WORKSPACE_PATH ?? "/shell-preview/workspace"}`,
    { waitUntil: "networkidle" },
  );

  const body = await page.locator("body").innerText();

  // The library's whole point: a document goes to a tool without a re-upload.
  const toolLinks = await page
    .locator('a[href*="documentId=doc-1"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));

  check(
    toolLinks.length === 5,
    `every tool can be opened against a document (${toolLinks.length} links)`,
  );
  check(
    ["/tools/ai-detector", "/tools/grammar", "/tools/naturalize", "/tools/grader", "/tools/citations"]
      .every((route) => toolLinks.some((href) => href.startsWith(route))),
    "the five tools are all reachable from a document",
  );

  // The banner a tool shows carries the field its action reads.
  const hidden = page.locator('input[name="documentId"]');
  check(
    (await hidden.count()) === 1 && (await hidden.inputValue()) === "doc-1",
    "the selected-document banner submits the document id",
  );
  check(
    /From your library/.test(body),
    "a tool run from the library says where its text came from",
  );
  check(
    /Use something else/.test(body),
    "there is a way back out of a library-selected document",
  );

  // Drafts are numbered by the server, and the control says what comes next.
  check(/v1/.test(body), "an attached draft shows its version");
  check(
    /Added as v2/.test(body),
    "the attach control says which version a new draft becomes",
  );
  check(
    /leaves the document in your library/.test(body),
    "removing a draft is distinguished from deleting the document",
  );

  // Attaching is a select, and the already-attached document is not offered.
  const options = await page
    .getByLabel("Document to attach as the next draft")
    .locator("option")
    .allInnerTexts();

  // doc-1 is already v1, so it must not be offered as v2; the other two must.
  check(
    !options.some((option) => option.trim() === "Memory consolidation essay"),
    "a document already attached is not offered again",
  );
  check(
    options.some((option) => option.includes("rewritten intro")) &&
      options.some((option) => option.includes("Supervisor feedback notes")),
    "every unattached document is offered",
  );

  check(errors.length === 0, "no uncaught client errors in the workspace",
    `client errors: ${errors.slice(0, 2).join(" | ")}`);

  await page.screenshot({ path: `${SHOT_DIR}/workspace.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nInteraction checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
