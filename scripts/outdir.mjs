import { execFileSync } from 'node:child_process'

/**
 * Resolves the build output directory.
 *
 * This exists because several agents run `npm run dev` at once from different
 * checkouts and worktrees. When they all share `dist/`, whichever server rebuilt
 * last overwrites the bundle everyone else is serving, which is a large part of
 * why the journal looked different locally than on the deployed build.
 *
 * So: a branch other than `main` gets its own `dist-<branch>`. `OUTDIR`
 * overrides everything, and a detached/unknown branch falls back to `dist`.
 */
export function resolveOutdir() {
  const override = process.env.OUTDIR
  if (override) return override

  let branch = ''
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'dist'
  }

  if (!branch || branch === 'main' || branch === 'HEAD') return 'dist'
  // Keep the folder name filesystem-safe on Windows.
  return `dist-${branch.replace(/[^a-zA-Z0-9._-]+/g, '-')}`
}
