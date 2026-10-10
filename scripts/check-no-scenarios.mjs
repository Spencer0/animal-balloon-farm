// Gate: "did any test code go into production?"
//
//   node scripts/check-no-scenarios.mjs --build   build a production bundle into .gate/prod, then scan it
//   node scripts/check-no-scenarios.mjs           scan an existing build (PAGES_OUTDIR or resolveOutdir())
//
// Test scenarios live in dev/ and the debug harness lives behind __GARDEN_DEBUG__.
// The build folds both away. This proves it two ways:
//   1. the bundle's strings: no scenario ids, harness names or debug globals;
//   2. the bundle's sourcemap: no module under dev/ was compiled into it.
// The sourcemap check matters because a dev/ module can be tree-shaken to
// nothing visible in the strings and still have been part of the build.
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveOutdir } from './outdir.mjs';

export const PROD_OUTDIR = '.gate/prod';
const MARKERS = ['owl/hunt-now', 'owl/ready-to-settle', 'raccoon/sleeping-by-can', 'meadow/tall-grass-garden', 'mole/going-flat', 'scenario ready:', 'runScenario', '__gardenDebug'];

/**
 * @param {string} outdir
 * @returns {Promise<{ scannedFiles: number, leaks: string[] }>}
 */
export async function findTestCodeLeaks(outdir) {
  const names = await readdir(outdir);
  const scripts = names.filter((name) => name.endsWith('.js'));
  const maps = names.filter((name) => name.endsWith('.js.map'));
  // An empty or wrong directory would pass every check below, so refuse it.
  if (scripts.length === 0) throw new Error(`No JavaScript bundle found in ${outdir}; build first.`);

  const leaks = [];
  for (const name of scripts) {
    const text = await readFile(`${outdir}/${name}`, 'utf8');
    for (const marker of MARKERS) if (text.includes(marker)) leaks.push(`${name} contains "${marker}"`);
  }
  for (const name of maps) {
    const map = JSON.parse(await readFile(`${outdir}/${name}`, 'utf8'));
    for (const source of map.sources ?? []) {
      if (/(^|\/)dev\//.test(source)) leaks.push(`${name} includes module ${source}`);
    }
  }
  return { scannedFiles: scripts.length + maps.length, leaks };
}

/** @param {string} outdir */
async function reportAndExit(outdir) {
  const { scannedFiles, leaks } = await findTestCodeLeaks(outdir);
  if (leaks.length) {
    console.error(`FAIL no-test-code: test code leaked into the production bundle in ${outdir}:\n  ${leaks.join('\n  ')}`);
    exit(1);
  }
  console.log(`PASS no-test-code: ${scannedFiles} bundle files in ${outdir} contain no test code.`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  if (process.argv.includes('--build')) {
    // GARDEN_DEBUG=0 forces the harness off even if the caller's shell sets it.
    const build = spawnSync(process.execPath, ['scripts/build.mjs'], {
      stdio: 'inherit',
      env: { ...env, PAGES_OUTDIR: PROD_OUTDIR, GARDEN_DEBUG: '0' },
    });
    if (build.status !== 0) exit(build.status ?? 1);
    await reportAndExit(PROD_OUTDIR);
  } else {
    await reportAndExit(env.PAGES_OUTDIR ?? resolveOutdir());
  }
}
