import { context } from 'esbuild'
import { createReadStream } from 'node:fs'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { resolveOutdir } from './outdir.mjs'

const outdir = resolveOutdir()
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

// esbuild's own `ctx.serve()` sends no cache headers, so a browser happily kept
// running an old `main.js` after a rebuild. That is the same class of bug as the
// journal looking different in different browsers: you change the code, the page
// does not change, and you go looking for a layout fault that was already fixed.
const root = resolve(outdir)
const port = Number(process.env.PORT ?? 8000)

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/**
 * @param {string} urlPath
 * @returns {string | null}
 */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const candidate = resolve(join(root, normalize(decoded)))
  // Never serve outside the build directory.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
  return candidate
}

const server = createServer(async (request, response) => {
  /**
   * @param {number} status
   * @param {string} file
   */
  const send = (status, file) => {
    response.writeHead(status, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    })
    createReadStream(file).pipe(response)
  }

  let file = resolveFile(request.url ?? '/')
  if (!file) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    await stat(file)
  } catch {
    // Single-page fallback so a deep link still boots the game.
    file = join(root, 'index.html')
  }
  try {
    await stat(file)
  } catch {
    response.writeHead(404).end('Not found')
    return
  }
  send(200, file)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Animal Balloon Farm ready at http://127.0.0.1:${port}/  (serving ${outdir}/, no-store)`)
})

const shutdown = async () => {
  server.close()
  await ctx.dispose()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
