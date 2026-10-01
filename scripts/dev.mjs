import { context } from 'esbuild'
import { watch } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const outdir = 'dist'
const publicdir = 'public'
const port = Number(process.env.PORT || 8000)

/**
 * `public/` is served from a copy inside the output directory rather than from
 * its source path, so anything regenerated there (a Blender export, a review
 * render) has to be re-copied to be visible. Copying the whole tree once at
 * startup left the asset viewer reviewing a stale model until the server was
 * restarted, which is exactly backwards for a screen whose job is eyeballing
 * new models.
 *
 * Copying only the file that changed keeps a re-export cheap, and matters on
 * Windows: a full re-copy trips over any file a browser tab or image viewer
 * still holds open, and one locked file must never take the server down.
 */
const copyAsset = async (/** @type {string} */ relative) => {
  const from = join(publicdir, relative)
  const to = join(outdir, relative)
  try {
    if ((await stat(from)).isDirectory()) return
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  } catch (rawError) {
    const error = /** @type {NodeJS.ErrnoException} */ (rawError)
    if (error.code === 'ENOENT') {
      // Copying overwrites but never prunes, so a deleted or renamed asset
      // would otherwise keep serving from the copy.
      await rm(to, { force: true }).catch(() => {})
      return
    }
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      // Another process still has the file open. The next change retries.
      console.warn(`[dev] ${relative} is locked (${error.code}); retry on the next change`)
      return
    }
    throw error
  }
}

const syncAllAssets = async () => {
  const walk = async (/** @type {string} */ dir) => {
    const { readdir } = await import('node:fs/promises')
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = join(dir.slice(publicdir.length + 1), entry.name)
      if (entry.isDirectory()) await walk(join(dir, entry.name))
      else await copyAsset(relative)
    }
  }
  await walk(publicdir)
}

await mkdir(outdir, { recursive: true })
await writeFile(`${outdir}/index.html`, await readFile('index.html', 'utf8'))
await syncAllAssets().catch((error) => {
  if (error?.code !== 'ENOENT') console.warn(`[dev] initial asset copy: ${error?.message ?? error}`)
})

const ctx = await context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir,
  entryNames: 'main',
  // The dev server is the place to exercise the debug harness, so it is on by
  // default. GARDEN_DEBUG=0 reproduces a production build locally.
  define: { __GARDEN_DEBUG__: process.env.GARDEN_DEBUG === '0' ? 'false' : 'true' },
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

// A Blender export changes only `public/`, which is not an esbuild input, so
// the bundle never rebuilds. Watch the asset directory so a re-exported model
// is live on the next reload. Writes are debounced because Blender drops a
// .blend, a .glb and a .png in turn.
/** @type {ReturnType<typeof setTimeout> | null} */
let syncTimer = null
const scheduleSync = (/** @type {string} */ _eventType, /** @type {string | null} */ filename) => {
  if (!filename) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void copyAsset(filename)
  }, 150)
}
try {
  watch(publicdir, { recursive: true }, scheduleSync)
} catch {
  // Recursive watching is unavailable on some platforms; a flat watch still
  // catches an export that replaces a file directly in public/.
  watch(publicdir, scheduleSync)
}
