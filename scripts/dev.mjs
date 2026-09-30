import { context } from 'esbuild'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'

const outdir = 'dist'
const port = Number(process.env.PORT || 8000)
await mkdir(outdir, { recursive: true })
await writeFile(`${outdir}/index.html`, await readFile('index.html', 'utf8'))
await cp('public', outdir, { recursive: true, force: true }).catch((error) => {
  if (error.code !== 'ENOENT') throw error
})

const ctx = await context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir,
  entryNames: 'main',
  sourcemap: true,
  logLevel: 'info',
})

await ctx.watch()
const server = await ctx.serve({ host: '127.0.0.1', port, servedir: outdir })
console.log(`Animal Balloon Farm ready at http://${server.hosts[0]}:${server.port}/`)

const shutdown = async () => {
  await ctx.dispose()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
