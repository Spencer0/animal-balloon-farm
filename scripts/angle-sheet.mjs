// @ts-nocheck
// Agent review helper: one animal from several sides on a single small contact sheet.
//
// Usage:
//   node scripts/angle-sheet.mjs <url> <out.jpg> [--species raccoon] [--min-stage 1]
//        [--wait 60000] [--angles 6] [--elevation 18] [--height 3.4] [--sleeping]
//
//   <url>        dev server page; add ?gardenDebug=1 (and &scenario=... to jump to a state)
//   <out>        output path OUTSIDE the repo, e.g. C:/Users/Spencer/.codex/agent-shots/raccoon.jpg
//   --species    which animal to circle (default: the first animal that has arrived)
//   --min-stage  skip wild visitors still at the carnival (default 1); 3 = residents only
//   --wait       settle time after load before the first frame (default 30000)
//   --angles     frames around the animal (default 6) -- each is 480x270, so the sheet stays small
//   --elevation  camera angle above the ground in degrees (default 18; the game's own view is steep)
//   --height     view height in world units (smaller = closer; default 3.4)
//   --sleeping   wait until the animal reports sleeping before shooting
//   --eval       JS to run in the page first (e.g. nightfall), then --after-eval ms to settle (default 60000)
//
// The game's own camera looks down at roughly 40 degrees, which hides a lying-down pose and the
// face of anything walking away. This circles at a low angle instead, at a deliberately tiny
// resolution: software rendering runs at a few FPS, and a sheet of six 480x270 frames is enough to
// judge a pose without producing a large image (see AGENTS.md on screenshot size).
//
// Needs playwright-core the same way scripts/screenshot.mjs does (NODE_PATH to a scratch install).
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright-core"));
} catch {
  console.error("angle-sheet: playwright-core is not resolvable (see scripts/screenshot.mjs for setup).");
  process.exit(1);
}

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/angle-sheet.mjs <url> <out.jpg> [--species id] [--wait ms] [--angles n] [--elevation deg] [--height h] [--sleeping]");
  process.exit(1);
}
const option = (name, fallback) => {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 && rest[index + 1] !== undefined && !rest[index + 1].startsWith("--") ? rest[index + 1] : fallback;
};
const species = option("species", "");
const minStage = Number(option("min-stage", 1));
const waitMs = Number(option("wait", 30000));
const angles = Math.max(2, Math.min(12, Number(option("angles", 6))));
const elevation = Number(option("elevation", 18));
const height = Number(option("height", 3.4));
const wantSleeping = rest.includes("--sleeping");

const local = process.env.LOCALAPPDATA ?? "";
const executablePath = [
  `${local}/ms-playwright/chromium-1208/chrome-win64/chrome.exe`,
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((path) => path && existsSync(path));

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (error) => console.log("pageerror:", String(error).slice(0, 300)));
await page.goto(url);
await page.waitForTimeout(waitMs);
// Optional setup in the page, e.g. nightfall so a resident wakes: --eval "__gardenDebug.setTimeOfDay(0.8)"
const setup = option("eval", "");
if (setup) {
  await page.evaluate(setup);
  await page.waitForTimeout(Number(option("after-eval", 60000)));
}

const pick = (wanted, stage, sleeping) => {
  const list = window.__gardenDebug.animalReport().filter((a) => a.stage >= stage && a.atFarm && (!wanted || a.species === wanted));
  return (sleeping ? list.find((a) => a.sleeping) : list[0]) ?? list[0] ?? null;
};
for (let attempt = 0; wantSleeping && attempt < 20; attempt += 1) {
  const found = await page.evaluate(`(${pick})(${JSON.stringify(species)}, ${minStage}, true)`);
  if (found?.sleeping) break;
  await page.waitForTimeout(10000);
}

const frames = [];
for (let index = 0; index < angles; index += 1) {
  const azimuth = Math.round((360 / angles) * index);
  const target = await page.evaluate(`(${pick})(${JSON.stringify(species)}, ${minStage}, ${wantSleeping})`);
  if (!target) {
    console.error(`angle-sheet: no ${species || "animal"} at stage >= ${minStage} on the farm`);
    await browser.close();
    process.exit(2);
  }
  await page.evaluate(`window.__gardenDebug.frameAngle(${target.x}, ${target.z}, ${height}, ${azimuth}, ${elevation})`);
  await page.waitForTimeout(2500);
  frames.push({ azimuth, png: await page.screenshot({ type: "png" }), info: `${target.species} · ${azimuth}°${target.sleeping ? " · asleep" : ""}` });
}

// Stitch in a plain page: three columns, a caption under each frame, one JPEG out.
const columns = Math.min(3, angles);
const sheet = await browser.newPage({ viewport: { width: columns * 480, height: Math.ceil(angles / columns) * 292 } });
await sheet.setContent(
  `<body style="margin:0;background:#222;font:12px sans-serif;color:#ddd;display:grid;grid-template-columns:repeat(${columns},480px)">` +
    frames.map((f) => `<figure style="margin:0"><img width="480" height="270" src="data:image/png;base64,${f.png.toString("base64")}"><figcaption style="height:22px;line-height:22px;padding-left:6px">${f.info}</figcaption></figure>`).join("") +
    "</body>",
);
await sheet.waitForTimeout(500);
await sheet.screenshot({ path: out, type: "jpeg", quality: 65 });
await browser.close();
console.log(`angle-sheet: wrote ${out} (${angles} frames)`);
