import { build } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { env } from 'node:process'
import { resolveOutdir } from './outdir.mjs'

// GitHub Pages publishes `dist/`, so CI (which checks out main) still lands
// there; a feature branch builds into its own folder instead of clobbering a
// dev server that another agent is serving from `dist/`.
const outdir = env.PAGES_OUTDIR ?? resolveOutdir()
// Rebuild from scratch so a renamed or removed asset never lingers in the output.
await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
const basePath = env.PAGES_BASE_PATH?.replace(/^\/+|\/+$/g, '')
// Branch previews keep the debug harness; a production build folds it away
// entirely so the harness, frame timing and FPS overlay never ship. Set
// GARDEN_DEBUG=1 to force it on locally, or GARDEN_DEBUG=0 to force it off.
const debugFlag = env.GARDEN_DEBUG
const gardenDebug = debugFlag === '0' ? 'false'
  : debugFlag === '1' || debugFlag === 'true' || Boolean(basePath) ? 'true'
    : 'false'
const basePrefix = basePath ? `/${basePath}/` : './'
// Blender sources sit beside their exports in public/ but the game only loads
// the .glb, so they stay out of the deploy (about 84 MB of it).
await cp('public', outdir, { recursive: true, force: true, filter: (path) => !/\.blend\d?$/.test(path) }).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir,
  define: { __GARDEN_DEBUG__: gardenDebug },
  // Hash bundle names so a redeploy is never shadowed by a browser that still
  // has the previous, stable-named bundle cached.
  entryNames: '[name]-[hash]',
  minify: true,
  ...(basePath ? { publicPath: `/${basePath}/` } : {}),
  sourcemap: true,
  metafile: true,
})

// esbuild emits `main-<hash>.js` for this entry point and, when the bundle pulls
// in CSS, a sibling `main-<hash>.css` reported via the JS output's `cssBundle`.
const emitted = new Map()
for (const [path, output] of Object.entries(result.metafile.outputs)) {
  if (!output.entryPoint || !path.endsWith('.js')) continue
  emitted.set('js', path.slice(path.lastIndexOf('/') + 1))
  if (output.cssBundle) emitted.set('css', output.cssBundle.slice(output.cssBundle.lastIndexOf('/') + 1))
}
if (!emitted.has('js')) throw new Error('esbuild produced no JavaScript bundle to reference')

const html = await readFile('index.html', 'utf8')
let indexHtml = html.replaceAll('./', basePrefix)
for (const [extension, name] of emitted) {
  indexHtml = indexHtml.replaceAll(`${basePrefix}main.${extension}`, `${basePrefix}${name}`)
}
await writeFile(`${outdir}/index.html`, indexHtml)

console.log(`Built into ${outdir}/ (garden debug: ${gardenDebug})`)
