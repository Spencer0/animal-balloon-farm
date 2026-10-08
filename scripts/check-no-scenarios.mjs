import { readdir, readFile } from 'node:fs/promises'
import { env, exit } from 'node:process'
import { resolveOutdir } from './outdir.mjs'

// Test scenarios live in dev/ and must never reach a production bundle. The
// build folds the debug harness away; this proves the scenarios went with it.
// Run after `npm run build` (a production build, i.e. without GARDEN_DEBUG=1).
const outdir = env.PAGES_OUTDIR ?? resolveOutdir()
const markers = ['owl/hunt-now', 'owl/ready-to-settle', 'scenario ready:', 'runScenario']

const leaks = []
for (const name of await readdir(outdir)) {
  if (!name.endsWith('.js')) continue
  const text = await readFile(`${outdir}/${name}`, 'utf8')
  for (const marker of markers) if (text.includes(marker)) leaks.push(`${name} contains "${marker}"`)
}
if (leaks.length) {
  console.error(`Test scenarios leaked into the production bundle in ${outdir}:\n  ${leaks.join('\n  ')}`)
  exit(1)
}
console.log(`No test scenarios in the production bundle (${outdir}).`)
