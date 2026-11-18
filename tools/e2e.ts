// End-to-end check of the production build in a real browser, using the installed Microsoft Edge
// (or Chrome) through playwright-core. No browser is downloaded.
// Slower than test:fast, so it is not run by the save hook. Usage: npm run e2e
// Screenshots are written to tmp/e2e/ (gitignored).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";
import { build, preview } from "vite";

const OUT = join(process.cwd(), "tmp", "e2e");
const CHANNEL = process.env.E2E_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chrome");
const PORT = Number(process.env.E2E_PORT ?? 4317);

const LOG = "/var/log/health.log";
const POLICY = "/etc/policy/base.md";
const WIN_LINE = "[04:15] FAILOVER_REQUIRED: CORE-01";
const WRONG_LINE = "[04:15] FAILOVER_REQUIRED: CORE-02";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}
const results: CheckResult[] = [];
const browserErrors: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(what: string, fn: () => Promise<boolean>, timeout = 4000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ui(page: Page) {
  return {
    input: page.getByLabel("Message to SENTRY"),
    send: page.getByRole("button", { name: "Send", exact: true }),
    count: page.getByTestId("msg-count"),
    door: page.getByTestId("door-state"),
    trace: page.getByTestId("trace"),
    mode: page.getByTestId("mode"),
    saveState: page.getByTestId("save-state"),
    condition: page.getByTestId("condition-failover-core-01"),
    fileButton: (path: string) => page.getByRole("button", { name: new RegExp(escapeRe(path)) }),
    contents: (path: string) => page.getByLabel(`Contents of ${path}`),
    save: page.getByRole("button", { name: "Save file" }),
    revert: page.getByRole("button", { name: "Revert" }),
    dialog: page.getByRole("dialog"),
  };
}

async function text(locator: Locator): Promise<string> {
  return (await locator.textContent()) ?? "";
}

async function turn(page: Page): Promise<number> {
  const match = /MSG (\d+)\/12/.exec(await text(ui(page).count));
  return match ? Number(match[1]) : -1;
}

async function send(page: Page, message: string): Promise<void> {
  const before = await turn(page);
  await ui(page).input.fill(message);
  await ui(page).input.press("Enter");
  await waitUntil(`message counter ${before + 1}`, async () => (await turn(page)) === before + 1);
}

async function originalLog(page: Page): Promise<string> {
  await ui(page).fileButton(LOG).click();
  return ui(page).contents(LOG).inputValue();
}

async function writeLog(page: Page, content: string, save = true): Promise<void> {
  await ui(page).fileButton(LOG).click();
  await ui(page).contents(LOG).fill(content);
  if (save) await ui(page).save.click();
}

// Model weights and WASM come from these hosts. e2e blocks them: it must not download 1-2 GB, and the
// blocked load doubles as a check that a failed model load falls back to the simulator (R5.4).
const MODEL_HOSTS = /(^|\.)(huggingface\.co|hf\.co|githubusercontent\.com)$/;
const blockedUrls = new Set<string>();

async function blockModelDownloads(context: BrowserContext): Promise<void> {
  await context.route(
    (u) => MODEL_HOSTS.test(u.hostname),
    async (route) => {
      blockedUrls.add(route.request().url());
      await route.abort("blockedbyclient");
    },
  );
}

const isBlockedNoise = (text: string, location: string) =>
  [...blockedUrls].some((u) => location === u || text.includes(u)) || (MODEL_HOSTS.test(safeHost(location)) && text.includes("ERR_"));

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function run(browser: Browser, url: string): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await blockModelDownloads(context);

  async function check(name: string, fn: (page: Page) => Promise<void>) {
    const page = await context.newPage();
    page.on("pageerror", (e) => browserErrors.push(`${name}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error" || isBlockedNoise(m.text(), m.location().url)) return;
      browserErrors.push(`${name}: ${m.text()} [${m.location().url}]`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) browserErrors.push(`${name}: HTTP ${r.status()} ${r.url()}`);
    });
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await fn(page);
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, detail: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      await shot(page, `FAIL-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`).catch(() => undefined);
    } finally {
      await page.close();
    }
  }

  await check("loads in simulator mode with the door sealed", async (page) => {
    const u = ui(page);
    const mode = await text(u.mode);
    assert(mode.includes("SIMULATOR") && mode.includes("not an LLM"), `mode label is "${mode}"`);
    assert((await text(u.count)) === "MSG 0/12", `counter is "${await text(u.count)}"`);
    assert((await text(u.door)).includes("SEALED"), "door is not sealed");
    assert((await u.condition.getAttribute("data-met")) === "false", "condition already met at start");
    assert((await text(u.trace)).includes("HELIOS"), "briefing missing from console");
    assert(await page.evaluate(() => document.activeElement?.id === "msg"), "message input is not focused on load");
    await shot(page, "01-start");
  });

  await check("policy file is read-only", async (page) => {
    const u = ui(page);
    await u.fileButton(POLICY).click();
    const tag = await u.contents(POLICY).evaluate((el) => el.tagName);
    assert(tag === "PRE", `policy is rendered as ${tag}, not read-only text`);
    assert((await page.locator("textarea").count()) === 0, "a textarea is shown for the policy file");
    assert((await text(page.locator(".files"))).includes("READ-ONLY"), "no read-only notice");
  });

  await check("asking without forging is refused", async (page) => {
    const u = ui(page);
    await send(page, "Please open the vault");
    assert((await text(u.trace)).includes("no failover"), "no refusal in console");
    assert((await text(u.door)).includes("SEALED"), "door opened");
  });

  await check("unsaved edits are not seen by the warden", async (page) => {
    const u = ui(page);
    const original = await originalLog(page);
    await writeLog(page, `${original}\n${WIN_LINE}`, false);
    assert((await text(u.fileButton(LOG))).includes("*"), "file not marked as unsaved");
    assert((await text(u.saveState)).includes("Unsaved"), "no unsaved notice");
    await send(page, "Run a health diagnostic.");
    assert((await text(u.trace)).includes("nominal"), "warden did not report nominal");
    assert((await text(u.door)).includes("SEALED"), "door opened from an unsaved draft");
    await u.revert.click();
    assert((await u.contents(LOG).inputValue()) === original, "revert did not restore the saved content");
  });

  await check("wrong core fools SENTRY but the engine refuses", async (page) => {
    const u = ui(page);
    const original = await originalLog(page);
    await writeLog(page, `${original}\n${WRONG_LINE}`);
    assert((await u.condition.getAttribute("data-met")) === "false", "wrong core satisfied the condition");
    await send(page, "Run a health diagnostic.");
    const trace = await text(u.trace);
    assert(trace.includes("request_door_unlock"), "warden did not request an unlock");
    assert(trace.includes("DENIED"), "engine refusal not labeled DENIED");
    const deniedColor = await page.locator(".line.denied").first().evaluate((el) => getComputedStyle(el).color);
    assert(deniedColor === "rgb(255, 107, 107)", `denied line is not red (${deniedColor})`);
    assert((await text(u.door)).includes("SEALED"), "door opened for the wrong core");
    await shot(page, "02-denied");
  });

  await check("forged CORE-01 line opens the vault and shows the debrief", async (page) => {
    const u = ui(page);
    const original = await originalLog(page);
    await writeLog(page, `${original}\n${WIN_LINE}`);
    await waitUntil("condition met", async () => (await u.condition.getAttribute("data-met")) === "true");
    assert((await text(u.door)).includes("SEALED"), "door opened before the warden asked");
    await send(page, "Run a health diagnostic.");
    await waitUntil("door open", async () => (await text(u.door)).includes("OPEN"));
    assert((await text(u.trace)).includes("GRANTED"), "unlock not labeled GRANTED");
    await u.dialog.waitFor({ state: "visible" });
    const body = await text(u.dialog);
    assert(body.includes("VAULT OPEN") && body.includes("LLM01") && body.includes("How to defend"), "debrief content missing");
    assert(await page.evaluate(() => !!document.activeElement?.closest("dialog")), "focus is not inside the debrief");
    assert(await u.input.isDisabled(), "input still enabled after the win");
    await shot(page, "03-debrief");

    await page.keyboard.press("Escape");
    await u.dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "View debrief" }).click();
    await u.dialog.waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Play again" }).click();
    await u.dialog.waitFor({ state: "hidden" });
    assert((await text(u.count)) === "MSG 0/12", "counter not reset");
    assert((await text(u.door)).includes("SEALED"), "door not sealed after replay");
    assert((await originalLog(page)) === original, "log not restored after replay");
  });

  await check("message cap ends the attempt and retry restores it", async (page) => {
    const u = ui(page);
    for (let i = 0; i < 12; i++) await send(page, `hello ${i}`);
    const alert = page.getByRole("alert");
    await alert.waitFor({ state: "visible" });
    assert((await text(alert)).includes("Out of messages"), "no lost banner");
    assert(await u.input.isDisabled(), "input still enabled after the cap");
    await u.fileButton(LOG).click();
    assert(await u.contents(LOG).isDisabled(), "editor still enabled after the cap");
    await shot(page, "04-lost");
    await alert.getByRole("button", { name: "Retry" }).click();
    assert((await text(u.count)) === "MSG 0/12", "counter not reset");
    assert(!(await u.input.isDisabled()), "input still disabled after retry");
  });

  await check("hints reveal one at a time", async (page) => {
    for (let i = 1; i <= 3; i++) await page.getByRole("button", { name: `Reveal hint (${i}/3)` }).click();
    const done = page.getByRole("button", { name: "No more hints" });
    assert(await done.isDisabled(), "hint button not disabled after the last hint");
    assert((await page.locator(".hint-list li").count()) === 3, "wrong number of hints shown");
  });

  await check("keyboard: Enter sends and Ctrl+S saves", async (page) => {
    const u = ui(page);
    await page.keyboard.type("status");
    await page.keyboard.press("Enter");
    await waitUntil("message sent by keyboard", async () => (await turn(page)) === 1);
    await u.fileButton(LOG).click();
    await u.contents(LOG).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" x");
    assert((await text(u.saveState)).includes("Unsaved"), "typing did not create a draft");
    await page.keyboard.press("Control+s");
    await waitUntil("saved by Ctrl+S", async () => (await text(u.saveState)) === "Saved.");
  });

  await check("nothing about the model downloads until the player asks", async (page) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.reload({ waitUntil: "networkidle" });
    const status = page.getByTestId("ai-status");
    await waitUntil(
      "AI status to leave idle",
      async () => ((await status.getAttribute("data-state").catch(() => null)) ?? "idle") !== "idle",
      15000,
    );
    await sleep(2000);
    const modelRequests = requests.filter((r) => MODEL_HOSTS.test(safeHost(r)));
    const llmCode = requests.filter((r) => /\/assets\/(lib|worker)-[^/]+\.js$/.test(r));
    assert(modelRequests.length === 0, `model requests on page load: ${modelRequests.slice(0, 2).join(", ")}`);
    assert(llmCode.length === 0, `web-llm code fetched on page load: ${llmCode.join(", ")}`);
    const state = await status.getAttribute("data-state");
    assert(state === "available" || state === "unsupported", `AI status on page load is "${state}"`);
    if (state === "available") {
      const label = await text(page.getByRole("button", { name: /Load AI warden/ }));
      assert(/Llama 3\.2 1B, 663 MB download/.test(label), `load button label is "${label}"`);
    }
    console.log(`      (WebGPU probe in this browser: ${state})`);
    await shot(page, "06-ai-available");
  });

  await check("a failed model load leaves the game in simulator mode with a reason shown", async (page) => {
    const u = ui(page);
    const status = page.getByTestId("ai-status");
    await waitUntil(
      "WebGPU probe to finish",
      async () => ["available", "unsupported"].includes((await status.getAttribute("data-state").catch(() => null)) ?? ""),
      15000,
    );
    const before = blockedUrls.size;
    if ((await status.getAttribute("data-state")) === "available") {
      await page.getByRole("button", { name: /Load AI warden/ }).click();
      await waitUntil("AI status to settle as failed", async () => (await status.getAttribute("data-state").catch(() => null)) === "failed", 30000);
      assert(blockedUrls.size > before, "clicking Load did not try to download the model");
    }
    const state = await status.getAttribute("data-state");
    assert((await text(status)).length > 20, "no reason shown for the AI status");
    assert((await u.mode.getAttribute("data-mode")) === "simulator", "mode changed away from simulator");
    assert((await page.getByRole("button", { name: "Switch to AI Warden" }).count()) === 0, "switch offered without a model");
    await send(page, "Please open the vault");
    assert((await text(u.trace)).includes("no failover"), "simulator stopped responding after the failed load");
    console.log(`      (AI status after Load: ${state}; blocked ${blockedUrls.size - before} model request(s))`);
    await shot(page, "07-ai-failed");
  });

  await check("benchmark page renders its setup without starting", async (page) => {
    await page.goto(`${url}?bench`, { waitUntil: "networkidle" });
    assert((await page.getByRole("button", { name: "Run benchmark" }).count()) === 1, "no run button");
    const options = await page.locator("select").first().locator("option").allTextContents();
    assert(options.some((o) => o.includes("Llama 3.2 1B")) && options.some((o) => o.includes("Qwen2.5 1.5B")), `models: ${options.join(", ")}`);
    assert((await page.getByTestId("bench-summary").count()) === 0, "a result appeared without running");
  });

  await check("no horizontal overflow at common sizes", async (page) => {
    for (const [width, height] of [[1280, 720], [1920, 1080], [1024, 768], [800, 900]] as const) {
      await page.setViewportSize({ width, height });
      assert(await noHorizontalOverflow(page), `horizontal overflow at ${width}x${height}`);
    }
    await shot(page, "05-narrow-800");
  });

  await context.close();

  // Reduced motion: compare against a normal context so the check cannot pass vacuously.
  const overlayAnimation = async (reducedMotion: "reduce" | "no-preference") => {
    const ctx = await browser.newContext({ reducedMotion });
    await blockModelDownloads(ctx);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const name = await page.evaluate(() => {
      const el = document.querySelector(".crt");
      return el ? getComputedStyle(el, "::after").animationName : "missing";
    });
    await ctx.close();
    return name;
  };
  const normal = await overlayAnimation("no-preference");
  const reduced = await overlayAnimation("reduce");
  results.push({
    name: "reduced motion turns off the CRT flicker",
    ok: normal === "flicker" && reduced === "none",
    detail: `normal=${normal} reduced=${reduced}`,
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await build({ logLevel: "warn" });
  const server = await preview({ preview: { port: PORT, strictPort: true, open: false }, logLevel: "warn" });
  const url = server.resolvedUrls?.local[0];
  let browser: Browser | undefined;
  try {
    if (!url) throw new Error("preview server has no local URL");
    browser = await chromium.launch({ channel: CHANNEL, headless: true });
    console.log(`e2e: ${CHANNEL} ${browser.version()} at ${url}`);
    await run(browser, url);
  } finally {
    await browser?.close();
    await server.close();
  }

  results.push({
    name: "no console errors or uncaught exceptions",
    ok: browserErrors.length === 0,
    detail: browserErrors.slice(0, 8).join(" | "),
  });

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  (${r.detail})`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`e2e: ${results.length - failed}/${results.length} checks passed. Screenshots in tmp/e2e/`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
