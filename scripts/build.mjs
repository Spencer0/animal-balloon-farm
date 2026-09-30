import { build } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { env } from 'node:process'

const outdir = 'dist'
// Rebuild from scratch so a renamed/removed asset never lingers in dist/.
await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
const basePath = env.PAGES_BASE_PATH?.replace(/^\/+|\/+$/g, '')
const basePrefix = basePath ? `/${basePath}/` : './'
await cp('public', outdir, { recursive: true, force: true }).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir,
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
