// Scripted performance scenarios for Animal Balloon Farm.
//
//   node scripts/perf-scenario.mjs --list
//   node scripts/perf-scenario.mjs --scenario shovel [--minFps 60] [--json out.json]
//   node scripts/perf-scenario.mjs --scenario crowd-ramp --ramp 10,20,30,40,50 [--minFps 0]
//
// Every scenario drives the compiled-in `window.__gardenDebug` harness over
// CDP (see scripts/cdp-lib.mjs and TESTING.md), so this needs a debug build
// (`npm run dev`, or GARDEN_DEBUG=1) and Chromium with remote debugging:
//
//   chromium --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-perf
//
// Oracle split (read this before tuning thresholds): p95 workMs (CPU time the
// game spent) is meaningful everywhere, including CI software rendering. p95
// intervalMs / sustained FPS (wall clock) is only meaningful on a real GPU.
// CI gates on work; humans read FPS locally.
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { assertViewport, openDebugPage, summarizeTiming, withSession } from './cdp-lib.mjs';

const DEFAULT_MIN_FPS = 60;
const DEFAULT_MIN_SAMPLES = 60;
// Samples are frame-driven, not clock-driven: on a software-rendered machine a
// frame can take ~0.7s, so a fixed 2s window would collect 3 frames and gate on
// noise. Keep sampling past the window until the frame count is met, capped here.
const MAX_SAMPLE_MS = 60_000;
const CROWD_MIN_SAMPLES = 30;

const PRELUDE = `
  const debug = window.__gardenDebug;
  const canvas = document.querySelector('#game');
  const waitFrames = (count) => new Promise((resolve) => {
    const step = () => --count <= 0 ? resolve() : requestAnimationFrame(step);
    requestAnimationFrame(step);
  });
  const pointer = (type, x, y, button = 0) => canvas.dispatchEvent(new PointerEvent(type, {
    clientX: x, clientY: y, pointerId: 77, button, bubbles: true,
    buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
  }));
  const collectNewSamples = async (durationMs, minSamples = 0) => {
    const samples = [];
    const intervals = [];
    const start = performance.now();
    let sampledFrameNumber = -1;
    while ((performance.now() - start < durationMs || samples.length < minSamples) && performance.now() - start < ${MAX_SAMPLE_MS}) {
      await waitFrames(1);
      const latest = debug.performanceSamples().at(-1);
      if (latest && latest.frameNumber !== sampledFrameNumber && latest.intervalMs > 0) {
        sampledFrameNumber = latest.frameNumber;
        samples.push(latest.workMs);
        intervals.push(latest.intervalMs);
      }
    }
    return { samples, intervals };
  };
`;

const GRASS_FIXTURE = `
  debug.closeMenu();
  debug.focusGarden();
  debug.clearGarden();
  debug.digAt(0, 0, 2.5, -1);
  debug.digAt(0, 0, 2.5, -1);
  debug.pourAt(0, 0, 2.2, 1.4);
  for (const x of [-4, 0, 4]) {
    for (const z of [-4, 0, 4]) debug.sowGrass(x, z, 2.8);
  }
  const fixtureTools = debug.state().tools;
  if (!fixtureTools || fixtureTools.grassBlades < 1000 || fixtureTools.waterCells < 4) {
    throw new Error('Stress fixture failed to populate: ' + JSON.stringify(fixtureTools));
  }
`;

const SCENARIOS = {
  shovel: {
    description: 'Drag the shovel across a grassed, ponded garden (terrain rebuild storm).',
    minSamples: DEFAULT_MIN_SAMPLES,
    expression: `(async () => {${PRELUDE}${GRASS_FIXTURE}
    debug.selectTool('shovel');
    const startPoint = debug.projectGardenPoint(0, 0);
    const endPoint = debug.projectGardenPoint(1.5, 0.35);
    if (!startPoint || !endPoint) throw new Error('Could not project the shovel drag into the canvas.');
    const rect = canvas.getBoundingClientRect();
    if (![startPoint.x, startPoint.y, endPoint.x, endPoint.y].every((value) =>
      value >= rect.left && value <= rect.right && value >= rect.top && value <= rect.bottom)) {
      throw new Error('Projected shovel drag is outside the visible garden canvas.');
    }
    pointer('pointermove', startPoint.x, startPoint.y);
    await waitFrames(3);
    pointer('pointerdown', startPoint.x, startPoint.y);
    await waitFrames(45);
    let samples = [];
    let intervals = [];
    try {
      const duration = 2200;
      const start = performance.now();
      let sampledFrameNumber = -1;
      while (performance.now() - start < duration || (samples.length < ${DEFAULT_MIN_SAMPLES} && performance.now() - start < ${MAX_SAMPLE_MS})) {
        const t = Math.min(1, (performance.now() - start) / duration);
        pointer('pointermove', startPoint.x + (endPoint.x - startPoint.x) * t, startPoint.y + (endPoint.y - startPoint.y) * t);
        await waitFrames(1);
        const latest = debug.performanceSamples().at(-1);
        if (latest && latest.frameNumber !== sampledFrameNumber && latest.intervalMs > 0) {
          sampledFrameNumber = latest.frameNumber;
          samples.push(latest.workMs);
          intervals.push(latest.intervalMs);
        }
      }
    } finally {
      pointer('pointerup', endPoint.x, endPoint.y);
    }
    await waitFrames(3);
    return {
      kind: 'shovel',
      viewport: [innerWidth, innerHeight],
      fixtureBlades: fixtureTools.grassBlades,
      fixtureWaterCells: fixtureTools.waterCells,
      shovelHoldSeconds: debug.state().tools?.holdSeconds ?? 0,
      terrainChanged: debug.state().tools?.terrainDirty === false && debug.state().tools?.terrainMin < 0,
      samples, intervals,
    };
  })()`,
    /** @param {any} result @returns {string | null} */
    check: (result) => {
      if (result.shovelHoldSeconds < 1) return 'shovel was not held down for a full second';
      if (!result.terrainChanged) return 'terrain never rebuilt under the shovel';
      return null;
    },
  },

  'grass-brush': {
    description: 'Drag the grass brush across a sown lawn (lawn paint, blade growth, pointer ray work).',
    minSamples: DEFAULT_MIN_SAMPLES,
    expression: `(async () => {${PRELUDE}${GRASS_FIXTURE}
    debug.selectTool('grass');
    const startPoint = debug.projectGardenPoint(-1.5, -1.0);
    const endPoint = debug.projectGardenPoint(1.5, 0.8);
    if (!startPoint || !endPoint) throw new Error('Could not project the grass brush drag into the canvas.');
    const rect = canvas.getBoundingClientRect();
    if (![startPoint.x, startPoint.y, endPoint.x, endPoint.y].every((value) =>
      value >= rect.left && value <= rect.right && value >= rect.top && value <= rect.bottom)) {
      throw new Error('Projected grass brush drag is outside the visible garden canvas.');
    }
    pointer('pointermove', startPoint.x, startPoint.y);
    await waitFrames(3);
    pointer('pointerdown', startPoint.x, startPoint.y);
    await waitFrames(10);
    let samples = [];
    let intervals = [];
    try {
      const duration = 2200;
      const start = performance.now();
      let sampledFrameNumber = -1;
      // The brush's pointer ray work runs in the pointermove handler, before the
      // frame, so frame workMs alone misses it. Each sample adds the handler time
      // spent since the previous sampled frame.
      let handlerMs = 0;
      while (performance.now() - start < duration || (samples.length < ${DEFAULT_MIN_SAMPLES} && performance.now() - start < ${MAX_SAMPLE_MS})) {
        const t = Math.min(1, (performance.now() - start) / duration);
        const moveStart = performance.now();
        pointer('pointermove', startPoint.x + (endPoint.x - startPoint.x) * t, startPoint.y + (endPoint.y - startPoint.y) * t);
        handlerMs += performance.now() - moveStart;
        await waitFrames(1);
        const latest = debug.performanceSamples().at(-1);
        if (latest && latest.frameNumber !== sampledFrameNumber && latest.intervalMs > 0) {
          sampledFrameNumber = latest.frameNumber;
          samples.push(latest.workMs + handlerMs);
          handlerMs = 0;
          intervals.push(latest.intervalMs);
        }
      }
    } finally {
      pointer('pointerup', endPoint.x, endPoint.y);
    }
    await waitFrames(3);
    const after = debug.state().tools;
    return {
      kind: 'grass-brush',
      viewport: [innerWidth, innerHeight],
      fixtureBlades: fixtureTools.grassBlades,
      grassHoldSeconds: after?.holdSeconds ?? 0,
      grassBlades: after?.grassBlades ?? 0,
      greenGroundVertices: after?.greenGroundVertices ?? 0,
      samples, intervals,
    };
  })()`,
    /** @param {any} result @returns {string | null} */
    check: (result) => {
      if (result.grassHoldSeconds < 1) return 'grass brush was not held down for a full second';
      if (!(result.greenGroundVertices > 0)) return 'no green ground painted under the grass brush';
      return null;
    },
  },

  dig: {
    description: 'Hold the shovel down in one spot (deep-hole terrain + water settle load).',
    minSamples: DEFAULT_MIN_SAMPLES,
    expression: `(async () => {${PRELUDE}${GRASS_FIXTURE}
    debug.selectTool('shovel');
    const point = debug.projectGardenPoint(0, 0);
    if (!point) throw new Error('Could not project the dig point into the canvas.');
    pointer('pointermove', point.x, point.y);
    await waitFrames(3);
    pointer('pointerdown', point.x, point.y);
    await waitFrames(10);
    let collected = { samples: [], intervals: [] };
    try {
      collected = await collectNewSamples(2200, ${DEFAULT_MIN_SAMPLES});
    } finally {
      pointer('pointerup', point.x, point.y);
    }
    await waitFrames(3);
    return {
      kind: 'dig',
      viewport: [innerWidth, innerHeight],
      shovelHoldSeconds: debug.state().tools?.holdSeconds ?? 0,
      terrainChanged: debug.state().tools?.terrainDirty === false && debug.state().tools?.terrainMin < 0,
      samples: collected.samples, intervals: collected.intervals,
    };
  })()`,
    /** @param {any} result @returns {string | null} */
    check: (result) => {
      if (result.shovelHoldSeconds < 1) return 'shovel was not held down for a full second';
      if (!result.terrainChanged) return 'terrain never rebuilt under the dig';
      return null;
    },
  },

  plant: {
    description: 'Plant + grow a mixed bed (seed rules, growth ticks, grass + water sim).',
    minSamples: DEFAULT_MIN_SAMPLES,
    expression: `(async () => {${PRELUDE}
    debug.closeMenu();
    debug.focusGarden();
    debug.clearGarden();
    debug.digAt(0, 0, 2.5, -1);
    debug.digAt(0, 0, 2.5, -1);
    debug.pourAt(0, 0, 2.2, 1.4);
    for (const x of [-4, 0, 4]) {
      for (const z of [-4, 0, 4]) debug.sowGrass(x, z, 2.8);
    }
    debug.grantSeeds(4);
    const lily = debug.plant('water-lily', 0.5, 0.5);
    const clover = debug.plant('clover', -3, 2);
    const poppy = debug.plant('poppy', 3, -2);
    if (!lily || lily.ok === false) throw new Error('Lily planting failed: ' + JSON.stringify(lily));
    const before = debug.farmState().tallGrassArea ?? 0;
    debug.growPlants(6, 2);
    const collected = await collectNewSamples(2000, ${DEFAULT_MIN_SAMPLES});
    await waitFrames(3);
    return {
      kind: 'plant',
      viewport: [innerWidth, innerHeight],
      plantings: { lily, clover, poppy },
      grassAreaBefore: before,
      grassAreaAfter: debug.farmState().tallGrassArea ?? 0,
      samples: collected.samples, intervals: collected.intervals,
    };
  })()`,
    /** @param {any} result @returns {string | null} */
    check: (result) => {
      if (!(result.grassAreaAfter > 0)) return 'no measurable grass after growPlants';
      return null;
    },
  },

  expand: {
    description: 'Expand the farm parcel mid-animation (bounds, terrain + water regrid).',
    minSamples: 30,
    expression: `(async () => {${PRELUDE}
    debug.closeMenu();
    debug.focusGarden();
    debug.clearGarden();
    debug.sowGrass(0, 0, 2.8);
    const before = debug.gardenReport().bounds.halfWidth;
    debug.expandFarm(2);
    const collected = await collectNewSamples(2500, 30);
    await waitFrames(3);
    return {
      kind: 'expand',
      viewport: [innerWidth, innerHeight],
      halfWidthBefore: before,
      halfWidthAfter: debug.gardenReport().bounds.halfWidth,
      samples: collected.samples, intervals: collected.intervals,
    };
  })()`,
    /** @param {any} result @returns {string | null} */
    check: (result) => {
      if (!(result.halfWidthAfter > result.halfWidthBefore)) return 'parcel bounds never grew';
      return null;
    },
  },
};

export { SCENARIOS };

/**
 * @param {string[]} argv
 * @returns {{ scenario: string, minFps: number, json: string | null, settleMs: number, sampleMs: number, ramp: number[], list: boolean, help: boolean, reload: boolean }}
 */
function parseArgs(argv) {
  const options = /** @type {{ scenario: string, minFps: number, json: string | null, settleMs: number, sampleMs: number, ramp: number[], list: boolean, help: boolean, reload: boolean }} */ ({ scenario: 'shovel', minFps: DEFAULT_MIN_FPS, json: null, settleMs: 1200, sampleMs: 1500, ramp: [10, 20, 30, 40, 50], list: false, help: false, reload: false });
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--reload') options.reload = true;
    else if (arg === '--scenario') options.scenario = argv[++i];
    else if (arg === '--minFps') options.minFps = Number(argv[++i]);
    else if (arg === '--json') options.json = argv[++i];
    else if (arg === '--settleMs') options.settleMs = Number(argv[++i]);
    else if (arg === '--sampleMs') options.sampleMs = Number(argv[++i]);
    else if (arg === '--ramp') options.ramp = argv[++i].split(',').map(Number);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * @param {{ sampleCount: number, p95WorkMs: number | null, p95FrameIntervalMs: number | null, sustainedFps: number | null }} summary
 * @param {{ minFps: number, minSamples: number }} budget
 */
function gateSingle(summary, { minFps, minSamples }) {
  if (!Number.isFinite(minFps) || minFps <= 0) return { pass: true, reason: 'measure-only (minFps 0)' };
  const maxFrameMs = 1000 / minFps;
  if (summary.sampleCount < minSamples) return { pass: false, reason: `only ${summary.sampleCount} samples (need ${minSamples})` };
  if (summary.p95WorkMs === null || summary.p95WorkMs > maxFrameMs) {
    return { pass: false, reason: `p95 work ${summary.p95WorkMs}ms exceeds ${maxFrameMs.toFixed(2)}ms budget` };
  }
  if (summary.p95FrameIntervalMs === null || summary.p95FrameIntervalMs > maxFrameMs || summary.sustainedFps === null || summary.sustainedFps < minFps) {
    return { pass: false, reason: `p95 interval ${summary.p95FrameIntervalMs}ms / ${summary.sustainedFps?.toFixed(1)} FPS misses ${minFps} FPS` };
  }
  return { pass: true, reason: `p95 work ${summary.p95WorkMs}ms, p95 interval ${summary.p95FrameIntervalMs}ms / ${summary.sustainedFps?.toFixed(1)} FPS` };
}

/**
 * @param {import('./cdp-lib.mjs').CDPClient} cdp
 * @param {string} name
 * @param {{ minFps: number }} options
 */
async function runSingle(cdp, name, options) {
  const scenario = /** @type {Record<string, { description: string, minSamples: number, expression: string, check: (result: any) => string | null }>} */ (SCENARIOS)[name];
  if (!scenario) throw new Error(`Unknown scenario: ${name}. Try --list.`);
  const viewport = await assertViewport(cdp);
  const raw = await cdp.evaluate(scenario.expression);
  const summary = summarizeTiming(raw.samples ?? [], raw.intervals ?? []);
  const fixtureProblem = scenario.check(raw);
  const gate = fixtureProblem
    ? { pass: false, reason: fixtureProblem }
    : gateSingle(summary, { minFps: options.minFps, minSamples: scenario.minSamples });
  return { scenario: name, description: scenario.description, viewport, ...raw, samples: undefined, intervals: undefined, timing: summary, gate };
}

/**
 * @param {import('./cdp-lib.mjs').CDPClient} cdp
 * @param {{ minFps: number, settleMs: number, sampleMs: number, ramp: number[] }} options
 */
async function runCrowdRamp(cdp, options) {
  const viewport = await assertViewport(cdp);
  await cdp.evaluate('window.__gardenDebug.closeMenu(); window.__gardenDebug.focusGarden(); window.__gardenDebug.clearGarden();');
  const steps = [];
  const budgetMs = options.minFps > 0 ? 1000 / options.minFps : 1000 / DEFAULT_MIN_FPS;
  let recommendedAnimals = 0;
  for (const count of options.ramp) {
    // One synchronous render first: exact draw calls + triangles for this load.
    const snapshot = await cdp.evaluate(`window.__gardenDebug.crowdStressTest(${count})`);
    // Then keep the fixtures live and sample sustained frame times.
    await cdp.evaluate(`window.__gardenDebug.setCrowd(${count})`);
    await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    const collected = await cdp.evaluate(`(async () => {
      const debug = window.__gardenDebug;
      const waitFrames = (n) => new Promise((r) => {
        const step = () => --n <= 0 ? r() : requestAnimationFrame(step);
        requestAnimationFrame(step);
      });
      const samples = [];
      const intervals = [];
      const start = performance.now();
      let n = -1;
      while (performance.now() - start < ${options.sampleMs} || (samples.length < ${CROWD_MIN_SAMPLES} && performance.now() - start < ${MAX_SAMPLE_MS})) {
        await waitFrames(1);
        const latest = debug.performanceSamples().at(-1);
        if (latest && latest.frameNumber !== n && latest.intervalMs > 0) {
          n = latest.frameNumber;
          samples.push(latest.workMs);
          intervals.push(latest.intervalMs);
        }
      }
      return { samples, intervals };
    })()`);
    const timing = summarizeTiming(collected.samples, collected.intervals);
    const withinWork = timing.p95WorkMs !== null && timing.p95WorkMs <= budgetMs;
    const withinInterval = timing.p95FrameIntervalMs !== null && timing.p95FrameIntervalMs <= budgetMs;
    if (withinWork && withinInterval) recommendedAnimals = count;
    steps.push({
      count,
      renderCalls: snapshot.renderCalls,
      triangles: snapshot.triangles,
      timing,
      withinBudget: withinWork && withinInterval,
    });
    console.log(`crowd ${count}: p95 work ${timing.p95WorkMs}ms, p95 interval ${timing.p95FrameIntervalMs}ms / ${timing.sustainedFps?.toFixed(1)} FPS, ${snapshot.renderCalls} calls, ${(snapshot.triangles / 1000).toFixed(0)}k tris`);
  }
  await cdp.evaluate('window.__gardenDebug.clearCrowd(); window.__gardenDebug.clearGarden();');
  const floor = steps[0];
  const gate = options.minFps <= 0
    ? { pass: true, reason: `measure-only; curve suggests ~${recommendedAnimals} animals at 60 FPS nominal` }
    : gateSingle(floor.timing, { minFps: options.minFps, minSamples: 30 }).pass
      ? { pass: true, reason: `floor (${floor.count} animals) holds; curve suggests ~${recommendedAnimals} animals` }
      : { pass: false, reason: `floor (${floor.count} animals) already over budget` };
  return { scenario: 'crowd-ramp', description: 'Sustained load curve of real animal models (the farm draws at most 40).', viewport, ramp: options.ramp, steps, recommendedAnimals, gate };
}

/**
 * Shared entry so perf-stress.mjs stays a thin compatibility wrapper.
 * @param {string} name
 * @param {{ minFps?: number, settleMs?: number, sampleMs?: number, ramp?: number[], cdpUrl?: string, baseUrl?: string, reload?: boolean }} [options]
 */
export async function runScenario(name, options = {}) {
  const full = {
    minFps: options.minFps ?? Number(process.env.MIN_FPS ?? DEFAULT_MIN_FPS),
    settleMs: options.settleMs ?? 1200,
    sampleMs: options.sampleMs ?? 1500,
    ramp: options.ramp ?? [10, 20, 30, 40, 50],
  };
  if (!Number.isFinite(full.minFps) || full.minFps < 0) throw new Error('minFps must be a non-negative number.');
  return withSession(options, async (cdp) => {
    await openDebugPage(cdp, undefined, options.reload ?? false);
    if (name === 'crowd-ramp') return runCrowdRamp(cdp, full);
    return runSingle(cdp, name, full);
  });
}

const invokedDirectly = process.argv[1]?.endsWith('perf-scenario.mjs');
if (invokedDirectly) {
  (async () => {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/perf-scenario.mjs --scenario <name> [--minFps 60] [--json out.json] [--reload]');
      console.log('       --scenario crowd-ramp --ramp 10,20,30,40,50 [--settleMs 1200] [--sampleMs 1500] [--minFps 0]');
      console.log('Scenarios:');
      for (const [name, scenario] of Object.entries(SCENARIOS)) console.log(`  ${name}: ${scenario.description}`);
      console.log('  crowd-ramp: Sustained load curve of real animal models (the farm draws at most 40).');
      return;
    }
    if (options.list) {
      for (const [name, scenario] of Object.entries(SCENARIOS)) console.log(`${name}: ${scenario.description}`);
      console.log('crowd-ramp: Sustained load curve of real animal models (the farm draws at most 40).');
      return;
    }
    const result = await runScenario(options.scenario, options);
    console.log(JSON.stringify(result, null, 2));
    if (options.json) {
      await writeFile(options.json, JSON.stringify(result, null, 2));
      console.log(`Wrote ${options.json}`);
    }
    if (!result.gate.pass) {
      console.error(`FAIL [${result.scenario}]: ${result.gate.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS [${result.scenario}]: ${result.gate.reason}`);
    }
  })().catch((error) => {
    console.error(`perf-scenario: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
