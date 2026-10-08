// Gate: "did the game get slower?"
//
//   npm run gate:stress                      work budgets (CPU per frame); works on any machine
//   npm run gate:stress -- --fps 60          also require real frame timing (only meaningful on a real GPU)
//   npm run gate:stress -- --only shovel,dig one or more scenarios, comma-separated
//   npm run gate:stress -- --headed          show the Chrome window while it runs
//   npm run gate:stress -- --gpu             drop the software-rendering flags (use on a machine with a GPU)
//   npm run gate:stress -- --budgets <file>  compare against another budget file (default perf/budgets.json)
//
// What it does: builds a debug bundle into .gate/debug, serves it on a free
// local port, launches Chrome with a free DevTools port, runs every scenario
// in scripts/perf-scenario.mjs, and compares each one to perf/budgets.json.
// Writes .gate/results/stress.json and exits 1 if anything failed.
//
// Why work budgets by default: p95 workMs is the CPU time the game spends per
// frame. Unlike wall-clock FPS it does not depend on whether a GPU is present,
// so the same budget means the same thing on a laptop and on CI.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { connectCDP } from './cdp-lib.mjs';
import { runScenario } from './perf-scenario.mjs';
import { findTestCodeLeaks } from './check-no-scenarios.mjs';

export const DEBUG_OUTDIR = '.gate/debug';
const PROFILE_DIR = '.gate/chrome-profile';
const RESULTS_PATH = '.gate/results/stress.json';
const BUDGETS_PATH = 'perf/budgets.json';
const DEFAULT_SCENARIOS = ['shovel', 'dig', 'plant', 'expand', 'crowd-ramp'];
/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.map': 'application/json',
};

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = { fps: 0, headed: false, gpu: false, only: DEFAULT_SCENARIOS, json: RESULTS_PATH, budgets: BUDGETS_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fps') options.fps = Number(argv[++i]);
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--gpu') options.gpu = true;
    else if (arg === '--only') options.only = argv[++i].split(',').map((name) => name.trim()).filter(Boolean);
    else if (arg === '--json') options.json = argv[++i];
    else if (arg === '--budgets') options.budgets = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.fps) || options.fps < 0) throw new Error('--fps must be a non-negative number.');
  return options;
}

/** Build the debug bundle the scenarios drive. Throws on build failure. */
function buildDebugBundle() {
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PAGES_OUTDIR: DEBUG_OUTDIR, GARDEN_DEBUG: '1' },
  });
  if (build.status !== 0) throw new Error('Debug build failed; see output above.');
}

/**
 * Proves the leak detector can actually fire. A debug bundle must contain
 * test code, so if the scan finds nothing there, the production check above
 * it cannot be trusted either.
 */
async function assertDetectorFires() {
  const { leaks } = await findTestCodeLeaks(DEBUG_OUTDIR);
  if (leaks.length === 0) throw new Error('Leak detector found nothing in the debug bundle; the production check cannot be trusted.');
}

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Serve the debug bundle the way the deployed site does: files as-is, unknown
 * paths fall back to index.html.
 * @param {number} port
 */
export async function serveBundle(port) {
  const root = normalize(join(process.cwd(), DEBUG_OUTDIR));
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      let file = normalize(join(root, pathname));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const info = await stat(file).catch(() => null);
      if (!info || info.isDirectory()) file = join(root, 'index.html');
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      res.end(await readFile(file));
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  return server;
}

/** Chrome locations per platform. CHROME_BIN wins, which is how CI points at its installed copy. */
export function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome not found. Install Chrome or set CHROME_BIN to its path.');
  return found;
}

/**
 * @param {string} chromePath
 * @param {{ port: number, headed: boolean, gpu: boolean }} options
 */
export function launchChrome(chromePath, { port, headed, gpu }) {
  mkdirSync(PROFILE_DIR, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${join(process.cwd(), PROFILE_DIR)}`,
    '--window-size=1280,720',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ];
  if (!headed) args.push('--headless=new');
  // Software GL keeps CI deterministic-ish; a real GPU run wants the native path.
  if (!gpu) args.push('--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader-webgl');
  // Linux runners without a user namespace need this; Windows and macOS do not.
  if (process.platform === 'linux') args.push('--no-sandbox');
  args.push('about:blank');
  return spawn(chromePath, args, { stdio: 'ignore' });
}

/** @param {number} port */
async function waitForDevTools(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ok = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok, () => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome did not expose DevTools on port ${port}.`);
}

/**
 * Chrome's --window-size is the outer window, so the page comes out shorter
 * by the browser's own chrome (tabs, address bar). Measure that offset and
 * resize the window until the page is exactly the scenarios' viewport.
 * @param {string} cdpUrl
 * @param {string} baseUrl
 */
export async function fitViewport(cdpUrl, baseUrl) {
  const page = await connectCDP({ cdpUrl, baseUrl });
  const version = await fetch(`${cdpUrl}/json/version`).then((r) => r.json());
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browser.addEventListener('open', resolve, { once: true });
    browser.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (reason: Error) => void }>} */
  const pending = new Map();
  browser.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  /** @param {string} method @param {Record<string, unknown>} [params] */
  const browserSend = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    browser.send(JSON.stringify({ id, method, params }));
  });
  try {
    /** @type {Array<{ id: string, type: string }>} */
    const targets = await fetch(`${cdpUrl}/json/list`).then((r) => r.json());
    const target = targets.find((entry) => entry.type === 'page');
    if (!target) throw new Error('Chrome has no page target to resize.');
    const { windowId } = await browserSend('Browser.getWindowForTarget', { targetId: target.id });
    const [innerW, innerH, outerW, outerH] = await page.evaluate('[innerWidth, innerHeight, outerWidth, outerHeight]');
    const bounds = { width: 1280 + outerW - innerW, height: 720 + outerH - innerH };
    await browserSend('Browser.setWindowBounds', { windowId, bounds: { ...bounds, windowState: 'normal' } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [width, height] = await page.evaluate('[innerWidth, innerHeight]');
    if (width !== 1280 || height !== 720) throw new Error(`Could not size the page to 1280x720 (got ${width}x${height}).`);
  } finally {
    browser.close();
    page.close();
  }
}

/**
 * The number a budget is compared against. Crowd-ramp's floor (the smallest
 * crowd) is the one that must hold, since the curve above it is advisory.
 * @param {any} result
 */
function workP95Of(result) {
  if (result.scenario === 'crowd-ramp') return result.steps?.[0]?.timing?.p95WorkMs ?? null;
  return result.timing?.p95WorkMs ?? null;
}

/**
 * @param {any} result
 * @param {{ maxP95WorkMs: number, minSamples?: number }} budget
 */
function judge(result, budget) {
  const failures = [];
  if (result.error) failures.push(result.error);
  if (result.gate && !result.gate.pass) failures.push(result.gate.reason);
  const samples = result.scenario === 'crowd-ramp' ? result.steps?.[0]?.timing?.sampleCount ?? 0 : result.timing?.sampleCount ?? 0;
  if (samples < (budget.minSamples ?? 30)) failures.push(`only ${samples} samples`);
  const p95 = workP95Of(result);
  if (p95 === null) failures.push('no work samples recorded');
  else if (p95 > budget.maxP95WorkMs) failures.push(`p95 work ${p95}ms over the ${budget.maxP95WorkMs}ms budget`);
  return failures;
}

/** @param {Array<{ name: string, p95: number | null, budget: number | undefined, fps: number | null, samples: number, failures: string[] }>} rows */
function printTable(rows) {
  /** @param {unknown} value @param {number} width */
  const pad = (value, width) => String(value ?? '-').padEnd(width);
  console.log(`${pad('scenario', 12)}${pad('samples', 9)}${pad('p95 work', 11)}${pad('budget', 10)}${pad('FPS', 8)}result`);
  for (const row of rows) {
    const fps = row.fps === null ? '-' : row.fps.toFixed(1);
    const status = row.failures.length ? `FAIL: ${row.failures.join('; ')}` : 'PASS';
    console.log(`${pad(row.name, 12)}${pad(row.samples, 9)}${pad(row.p95 === null ? null : `${row.p95}ms`, 11)}${pad(row.budget === undefined ? 'none' : `${row.budget}ms`, 10)}${pad(fps, 8)}${status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const budgets = JSON.parse(await readFile(options.budgets, 'utf8')).scenarios;

  buildDebugBundle();
  await assertDetectorFires();

  const port = await freePort();
  const devToolsPort = await freePort();
  const server = await serveBundle(port);
  const chrome = launchChrome(findChrome(), { port: devToolsPort, headed: options.headed, gpu: options.gpu });
  const cdpUrl = `http://127.0.0.1:${devToolsPort}`;
  const baseUrl = `http://127.0.0.1:${port}/`;

  const results = [];
  try {
    await waitForDevTools(devToolsPort);
    await fitViewport(cdpUrl, baseUrl);
    for (const name of options.only) {
      console.log(`running ${name}...`);
      let result;
      try {
        // Three crowd steps keep the gate short; the full curve is still available via perf-scenario.mjs.
        const ramp = name === 'crowd-ramp' ? [10, 30, 50] : undefined;
        result = await runScenario(name, { minFps: options.fps, cdpUrl, baseUrl, ramp });
      } catch (error) {
        result = { scenario: name, error: error instanceof Error ? error.message : String(error) };
      }
      results.push(result);
    }
  } finally {
    chrome.kill();
    server.close();
  }

  const rows = results.map((result) => {
    const budget = budgets[result.scenario];
    const failures = budget ? judge(result, budget) : [`no budget for ${result.scenario} in ${options.budgets}`];
    const timing = result.scenario === 'crowd-ramp' ? result.steps?.[0]?.timing : result.timing;
    return {
      name: result.scenario,
      p95: workP95Of(result),
      budget: budget?.maxP95WorkMs,
      fps: timing?.sustainedFps ?? null,
      samples: timing?.sampleCount ?? 0,
      failures,
    };
  });
  printTable(rows);

  const pass = rows.every((row) => row.failures.length === 0);
  const report = { pass, fps: options.fps, gpu: options.gpu, generatedAt: new Date().toISOString(), rows, results };
  mkdirSync(join(process.cwd(), options.json, '..'), { recursive: true });
  await writeFile(options.json, JSON.stringify(report, null, 2));
  console.log(`Wrote ${options.json}`);
  if (pass) console.log('PASS stress: every scenario is within budget.');
  else {
    console.error('FAIL stress: at least one scenario regressed or could not run.');
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`gate-stress: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
