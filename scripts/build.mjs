import { build } from 'esbuild'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolveOutdir } from './outdir.mjs'

// GitHub Pages publishes `dist/`, so CI (which checks out main) still lands
// there; a feature branch builds into its own folder instead of clobbering a
// dev server that another agent is serving from `dist/`.
const outdir = process.env.PAGES_OUTDIR ?? resolveOutdir()
await mkdir(outdir, { recursive: true })
await writeFile(`${outdir}/index.html`, await readFile('index.html', 'utf8'))
await cp('public', outdir, { recursive: true, force: true }).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir,
  entryNames: 'main',
  minify: true,
  sourcemap: true,
})

console.log(`Built into ${outdir}/`)
