// @ts-nocheck
// Agent screenshot helper: headless-Chromium stills of the running game.
//
// Usage:
//   node scripts/screenshot.mjs <url> <out.jpg> [key] [waitMs]
//
//   <url>    dev server page, e.g. http://127.0.0.1:8123/
//   <out>    output path OUTSIDE the repo (keeps `git status` clean),
//            e.g. C:/Users/Spencer/.codex/agent-shots/farm.jpg
//   [key]    optional keyboard press after load (the main menu listens for
//            "1" = ENTER the farm, "2" = viewer, "3" = options)
//   [waitMs] settle time after the keypress (default 8000)
//
// Setup (one time per machine, NOT in this repo -- never add playwright to
// package.json): `npm install playwright-core` in a scratch dir and run with
// NODE_PATH pointed at it, or `npm install -g playwright-core`. Browsers
// already live in %LOCALAPPDATA%/ms-playwright on this PC; when they are
// missing there, `npx playwright install chromium` fetches them.
//
// Rules (see AGENTS.md): viewport stays 1280x720, JPEG quality 70, one shot
// per state change, never fullPage on the game canvas. Small files keep the
// agent transcript usable.
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright-core"));
} catch {
  console.error("screenshot: playwright-core is not resolvable.");
  console.error("  npm install playwright-core in a scratch dir and retry with");
  console.error("  NODE_PATH=<scratch>/node_modules node scripts/screenshot.mjs ...");
  process.exit(1);
}

const [url, out, key, waitArg] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <out.jpg> [key] [waitMs]");
  process.exit(1);
}
const waitMs = Number(waitArg ?? 8000);
const local = process.env.LOCALAPPDATA ?? "";
const candidates = [
  `${local}/ms-playwright/chromium-1208/chrome-win64/chrome.exe`,
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const executablePath = candidates.find((path) => path && existsSync(path));
const { mkdirSync } = await import("node:fs");
mkdirSync(dirname(fileURLToPath(`file:///${out.replace(/\\/g, "/")}`)), { recursive: true });
const launchOptions = {
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
  ...(executablePath ? { executablePath } : {}),
};
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const issues = [];
page.on("pageerror", (error) => issues.push(String(error).slice(0, 300)));
page.on("console", (message) => {
  if (message.type() === "error") issues.push(message.text().slice(0, 300));
});
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3000);
if (key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(waitMs);
} else {
  await page.waitForTimeout(waitMs);
}
await page.screenshot({ path: out, type: "jpeg", quality: 70 });
await browser.close();
console.log(`saved ${out}`);
if (issues.length) {
  console.log("PAGE ISSUES:");
  for (const issue of issues.slice(0, 10)) console.log(` - ${issue}`);
} else {
  console.log("no page errors");
}
