import { build } from 'esbuild'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'

const outdir = 'dist'
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
