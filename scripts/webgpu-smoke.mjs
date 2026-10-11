// WebGPU smoke test: "does the farm still draw under ?renderer=webgpu?"
//
//   node scripts/webgpu-smoke.mjs            build a debug bundle, then run
//   node scripts/webgpu-smoke.mjs --no-build reuse .gate/debug
//
// The stress gate pins `?renderer=webgl` (its budgets are WebGL numbers), so it does
// not cover it. This launches Chrome with software WebGPU (SwiftShader Vulkan),
// loads the farm with `?renderer=webgpu`, and checks that it really got a
// WebGPU renderer, drew frames and the film post chain, and logged no errors.
//
// Exit codes: 0 pass, 1 fail, 3 this runner cannot get a WebGPU adapter (the
// workflow treats that as "skipped", not a regression).
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { connectCDP, openDebugPage } from './cdp-lib.mjs';
import { buildDebugBundle, findChrome, freePort, launchChrome, serveBundle, waitForDevTools } from './gate-stress.mjs';

const NO_ADAPTER = 3;
const WEBGPU_FLAGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPUService',
  '--use-webgpu-adapter=swiftshader',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
];
/** Console noise that is not a regression. */
const IGNORED = [/powerPreference/, /AudioContext/, /GPU stall due to ReadPixels/];

async function main() {
  if (!process.argv.includes('--no-build')) buildDebugBundle();
  const port = await freePort();
  const devToolsPort = await freePort();
  const server = await serveBundle(port);
  const chrome = launchChrome(findChrome(), { port: devToolsPort, headed: false, gpu: false, extraArgs: WEBGPU_FLAGS });
  /** @type {string[]} */
  const errors = [];
  try {
    await waitForDevTools(devToolsPort);
    const baseUrl = `http://127.0.0.1:${port}/?renderer=webgpu`;
    const cdp = await connectCDP({ cdpUrl: `http://127.0.0.1:${devToolsPort}`, baseUrl });
    cdp.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(`console.error: ${message.params.args.map((/** @type {{ value?: unknown, description?: string }} */ arg) => arg.value ?? arg.description ?? '').join(' ')}`);
      }
    });
    await cdp.send('Runtime.enable');
    const adapter = await cdp.evaluate(`(async () => {
      const gpu = navigator.gpu;
      if (!gpu) return { ok: false, reason: 'navigator.gpu is undefined' };
      const adapter = await gpu.requestAdapter().catch((e) => null);
      if (!adapter) return { ok: false, reason: 'requestAdapter() returned null' };
      return { ok: true, info: adapter.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.isFallbackAdapter } : {} };
    })()`).catch((error) => ({ ok: false, reason: String(error) }));
    console.log(`adapter: ${JSON.stringify(adapter)}`);
    if (!adapter.ok) {
      console.log(`SKIP webgpu-smoke: no WebGPU adapter on this runner (${adapter.reason}).`);
      return NO_ADAPTER;
    }
    await openDebugPage(cdp, 120_000, true);
    const state = await cdp.evaluate(`(async () => {
      const d = window.__gardenDebug;
      d.closeMenu(); d.focusGarden();
      await new Promise((r) => setTimeout(r, 3000));
      const samples = d.performanceSamples().filter((s) => s.intervalMs > 0);
      const snapshot = d.renderSnapshot();
      return { renderer: document.documentElement.dataset.renderer, frames: samples.length, snapshot };
    })()`);
    console.log(`farm: ${JSON.stringify(state)}`);
    const film = await cdp.evaluate(`(async () => {
      const d = window.__gardenDebug;
      d.intro(2);
      const start = performance.now();
      while (!d.intro(2).loaded && performance.now() - start < 90000) await new Promise((r) => setTimeout(r, 500));
      return d.intro(2);
    })()`);
    console.log(`intro film: ${JSON.stringify(film)}`);
    cdp.close();

    const failures = [];
    if (state.renderer !== 'webgpu') failures.push(`renderer was "${state.renderer}", not webgpu (it fell back)`);
    if (state.frames < 3) failures.push(`only ${state.frames} frames were drawn`);
    if (!(state.snapshot?.renderCalls > 0)) failures.push('a forced render reported no draw calls');
    if (!film?.loaded) failures.push('the intro film did not load');
    const real = errors.filter((line) => !IGNORED.some((pattern) => pattern.test(line)));
    if (real.length) failures.push(`${real.length} page error(s): ${real.slice(0, 5).join(' | ')}`);
    if (failures.length) {
      console.error(`FAIL webgpu-smoke:\n  ${failures.join('\n  ')}`);
      return 1;
    }
    console.log('PASS webgpu-smoke: WebGPU renderer drew the farm and the intro film.');
    return 0;
  } finally {
    chrome.kill();
    server.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`webgpu-smoke: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
