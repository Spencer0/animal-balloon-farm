// Compatibility wrapper: the shovel stress gate now lives in
// scripts/perf-scenario.mjs alongside the dig/plant/expand/crowd-ramp
// scenarios. This file keeps the `npm run perf:stress` contract
// (GARDEN_URL, GARDEN_CDP_URL, MIN_FPS) unchanged for CI.
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { runScenario } from './perf-scenario.mjs';

const jsonIndex = process.argv.indexOf('--json');
const jsonPath = jsonIndex === -1 ? null : process.argv[jsonIndex + 1];
if (jsonIndex !== -1 && !jsonPath) throw new Error('perf-stress.mjs --json needs a file path');

const result = await runScenario('shovel', {
  minFps: Number(process.env.MIN_FPS ?? 60),
});
console.log(JSON.stringify(result, null, 2));
if (jsonPath) {
  await writeFile(jsonPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${jsonPath}`);
}
if (!result.gate.pass) {
  console.error(`FAIL: ${result.gate.reason} (required ${process.env.MIN_FPS ?? 60} FPS with at least 60 samples)`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${result.gate.reason}`);
}
