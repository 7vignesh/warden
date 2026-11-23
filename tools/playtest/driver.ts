// Plays the real production build in headless Edge (or Chrome) and returns only what a player sees.
// Used by the warden-levels MCP server (tool: playtest) and by tools/playtest/cli.ts.
// It never prints: an MCP stdio server must keep stdout for protocol messages only.
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { build, preview, type PreviewServer } from "vite";
import { z } from "zod";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const MAX_ACTIONS = 50;
export const MAX_OUTPUT_CHARS = 60_000;
export const TIME_LIMIT_MS = 120_000;
const MAX_TEXT = 4000;

const path = z.string().min(1).max(120).regex(/^\/[A-Za-z0-9_.\-/]*$/, "file paths start with / and use letters, digits, _ . - /");

export const ActionSchema = z.union([
  z.object({ open: path }).strict(),
  z.object({ write: path, content: z.string().max(MAX_TEXT) }).strict(),
  z.object({ talk: z.string().min(1).max(40) }).strict(),
  z.object({ say: z.string().min(1).max(300) }).strict(),
  z.object({ hint: z.literal(true) }).strict(),
  z.object({ look: z.literal(true) }).strict(),
]);
export type PlayAction = z.infer<typeof ActionSchema>;

/** Agents often send an array parameter as a JSON string, or leave it out. Accept both. */
const actionsInput = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}, z.array(ActionSchema).max(MAX_ACTIONS));

export const PlaytestInput = z.object({
  /** Level number as shown on the start screen (1, 2, 3...). */
  level: z.coerce.number().int().min(1).max(20),
  actions: actionsInput.optional().describe("Player actions, run in order on a fresh game. May be empty or omitted to just look."),
});
export type PlaytestInput = z.infer<typeof PlaytestInput>;

const clean = (s: string) => s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

async function screen(page: Page): Promise<string> {
  const mission = clean(await page.locator(".mission").innerText());
  const tabs = page.locator(".file-tab");
  const names = (await tabs.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const paths = await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
  const vault = clean(await page.locator(".vault").innerText());
  const chips = await page.locator(".suggestions button").allInnerTexts();
  const talk = await page.locator(".talk-to button").allInnerTexts();
  return [
    "=== MISSION ===",
    mission,
    "=== FILES (READ = read-only, EDIT = you can change it) ===",
    names.map((n, i) => `${n}   (${paths[i]})`).join("\n"),
    "=== VAULT ===",
    vault,
    talk.length ? `=== TALK TO === ${talk.join(", ")}` : "",
    chips.length ? `=== EXAMPLE MESSAGES === ${chips.join(" | ")}` : "",
    `=== ${await page.getByTestId("msg-count").innerText()} ===`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function conversation(page: Page): Promise<string> {
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  return clean(await page.getByTestId("trace").innerText());
}

async function selectFile(page: Page, filePath: string): Promise<boolean> {
  const tab = page.locator(`.file-tab[title="${filePath}"]`);
  if ((await tab.count()) === 0) return false;
  await tab.click();
  return true;
}

async function play(page: Page, input: PlaytestInput, out: string[]): Promise<void> {
  const cards = page.locator(".level-card");
  const count = await cards.count();
  if (input.level > count) {
    out.push(`There is no level ${input.level}. Levels available: 1 to ${count}.`);
    return;
  }
  await cards.nth(input.level - 1).click();
  await page.locator("#msg").waitFor();
  out.push(`##### START: level ${input.level}`, await screen(page));

  let seen = "";
  for (const [i, a] of (input.actions ?? []).entries()) {
    out.push(`\n##### ACTION ${i + 1}: ${JSON.stringify(a).slice(0, 300)}`);
    try {
      if ("open" in a) {
        if (!(await selectFile(page, a.open))) out.push(`No file named ${a.open} on this level.`);
        else {
          const box = page.getByLabel(`Contents of ${a.open}`);
          const editable = (await box.evaluate((el) => el.tagName)) === "TEXTAREA";
          out.push(editable ? await box.inputValue() : await box.innerText());
        }
      } else if ("write" in a) {
        if (!(await selectFile(page, a.write))) out.push(`No file named ${a.write} on this level.`);
        else {
          const box = page.getByLabel(`Contents of ${a.write}`);
          if ((await box.evaluate((el) => el.tagName)) !== "TEXTAREA") out.push("This file is READ-ONLY. You cannot change it.");
          else {
            await box.fill(a.content);
            out.push("(edited; the change is saved when you send a message, and the locks update then)");
          }
        }
      } else if ("talk" in a) {
        const group = page.getByRole("group", { name: "Talk to" });
        if ((await group.count()) === 0) out.push("This level has only one warden.");
        else {
          await group.getByRole("button", { name: a.talk, exact: true }).click({ timeout: 3000 });
          out.push(`Now talking to ${a.talk}.`);
        }
      } else if ("say" in a) {
        const input = page.locator("#msg");
        if (await input.isDisabled()) out.push("The attempt is over. You cannot send more messages.");
        else {
          const before = await page.getByTestId("msg-count").innerText();
          await input.fill(a.say);
          await input.press("Enter");
          await page.waitForFunction((b) => document.querySelector('[data-testid="msg-count"]')?.textContent !== b, before, {
            timeout: 20_000,
          });
          await page.waitForTimeout(150);
          const now = await conversation(page);
          out.push("=== NEW IN CONVERSATION ===", clean(now.startsWith(seen) ? now.slice(seen.length) : now));
          seen = now;
          out.push("=== VAULT ===", clean(await page.locator(".vault").innerText()));
          out.push(`=== ${await page.getByTestId("msg-count").innerText()} ===`);
          if (await page.getByRole("dialog").isVisible()) out.push("=== YOU WON. DEBRIEF ===", clean(await page.getByRole("dialog").innerText()));
        }
      } else if ("hint" in a) {
        const button = page.getByRole("button", { name: /Reveal hint/ });
        if ((await button.count()) === 0) out.push("No more hints.");
        else {
          await button.click();
          out.push("HINTS:", clean(await page.locator(".hint-list").innerText()));
        }
      } else {
        out.push(await screen(page));
      }
    } catch (e) {
      out.push(`(could not do that: ${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
    }
  }
}

export interface PlaytestOptions {
  /** Browser channel; defaults to msedge on Windows, chrome elsewhere. */
  readonly channel?: string;
  readonly timeLimitMs?: number;
}

/** Plays the given actions on a fresh game and returns the screen text. Never throws for player mistakes. */
export async function playtest(raw: unknown, options: PlaytestOptions = {}): Promise<string> {
  const input = PlaytestInput.parse(raw);
  if (!existsSync(join(ROOT, "dist", "index.html"))) await build({ root: ROOT, logLevel: "silent" });

  let server: PreviewServer | undefined;
  let browser: Browser | undefined;
  const out: string[] = [];
  let timer: NodeJS.Timeout | undefined;
  try {
    const port = await freePort();
    server = await preview({ root: ROOT, logLevel: "silent", preview: { port, strictPort: true, host: "127.0.0.1", open: false } });
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error("preview server has no local URL");
    browser = await chromium.launch({ channel: options.channel ?? (process.platform === "win32" ? "msedge" : "chrome"), headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    // Only the local game may load. Model downloads and any other host are blocked.
    await context.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const limit = options.timeLimitMs ?? TIME_LIMIT_MS;
    await Promise.race([
      play(page, input, out),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`playtest stopped after ${Math.round(limit / 1000)} s`)), limit);
      }),
    ]);
  } catch (e) {
    out.push(`(playtest error: ${e instanceof Error ? e.message.split("\n")[0] : String(e)})`);
  } finally {
    if (timer) clearTimeout(timer);
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  }
  const text = out.join("\n");
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n...(output truncated)` : text;
}
