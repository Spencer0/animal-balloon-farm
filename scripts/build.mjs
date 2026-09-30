import { build } from 'esbuild'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { env } from 'node:process'

const outdir = 'dist'
await mkdir(outdir, { recursive: true })
const basePath = env.PAGES_BASE_PATH?.replace(/^\/+|\/+$/g, '')
const basePrefix = basePath ? `/${basePath}/` : './'
const html = await readFile('index.html', 'utf8')
await writeFile(`${outdir}/index.html`, html.replaceAll('./', basePrefix))
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
  ...(basePath ? { publicPath: `/${basePath}/` } : {}),
  sourcemap: true,
})
