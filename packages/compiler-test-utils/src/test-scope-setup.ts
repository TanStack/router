/**
 * Vitest `setupFiles` entry of the compiler test projects. Setup files run
 * once per test file, also when the worker keeps its modules across files
 * (`isolate: false`), so every file gets both:
 *
 * - every test runs inside its own scope (`./test-scope`), so that helpers
 *   find the test their work belongs to when the tests of a file run
 *   concurrently;
 * - the process environment (and working directory) is the one the file
 *   started with again once
 *   the file's tests ended: tools change it as they run (`vite build` sets
 *   `NODE_ENV=production` when it is unset, and a later dev server of the
 *   same process would then serve production code without React Refresh's
 *   page preamble), so with modules kept across files a file would see what
 *   an earlier file's tools left there;
 * - what the file's tests shared (`onFileFinished` of `./test-scope`, e.g.
 *   the run pages of `./browser`) is released once its tests ended, after
 *   the file's own `afterAll` hooks (they ran first: hooks after the tests
 *   run in reverse order, and this file registers its hooks first);
 * - a file fails when the compilers it ran used a plan against facts an
 *   invalidation should have dropped (`staleHits`: a dependency the file
 *   events' invalidation missed), or left paths in a stale set that no
 *   rebuild took, counted through the compiler's stats knob
 *   (`TSR_COMPILER_STATS`, on for the run: `./run-directory`). A process
 *   keeps the compilers of earlier files alive (Vite 8 keeps every finished
 *   build's plugins): what the file found at its start is not its own.
 */
import { afterAll, aroundEach, beforeAll } from 'vitest'
import { runFileCleanups, runInTestScope } from './test-scope'

aroundEach(async (runTest, context) => {
  await runInTestScope(context, runTest)
})

/** What the live compilers of this process count of stale plans and paths. */
async function staleCounts(): Promise<
  Record<string, { staleHits: number; stalePaths: number }>
> {
  const out: Record<string, { staleHits: number; stalePaths: number }> = {}
  // (no compiler ran in this process: nothing to load)
  if (
    !(globalThis as Record<symbol, unknown>)[
      Symbol.for('tanstack.compiler.stats')
    ]
  ) {
    return out
  }
  const { compilerStats } = await import('@tanstack/router-utils/compiler')
  const bytes = process.env.TSR_COMPILER_STATS_BYTES
  // (counts only: the byte estimates serialise every cache)
  process.env.TSR_COMPILER_STATS_BYTES = '0'
  try {
    for (const [label, counts] of Object.entries(compilerStats())) {
      if ('staleHits' in counts || 'stalePaths' in counts) {
        out[label] = {
          staleHits: counts.staleHits ?? 0,
          stalePaths: counts.stalePaths ?? 0,
        }
      }
    }
  } finally {
    if (bytes === undefined) {
      delete process.env.TSR_COMPILER_STATS_BYTES
    } else {
      process.env.TSR_COMPILER_STATS_BYTES = bytes
    }
  }
  return out
}

let atStart: Awaited<ReturnType<typeof staleCounts>> = {}
beforeAll(async () => {
  atStart = await staleCounts()
})

const environment = { ...process.env }
const cwd = process.cwd()
afterAll(async () => {
  try {
    await runFileCleanups()
    const grown = Object.entries(await staleCounts()).flatMap(
      ([label, { staleHits, stalePaths }]) => {
        const before = atStart[label] ?? { staleHits: 0, stalePaths: 0 }
        return staleHits > before.staleHits || stalePaths > before.stalePaths
          ? [
              `${label}: ${staleHits - before.staleHits} stale hits, ${stalePaths} stale paths (${before.stalePaths} at the file's start)`,
            ]
          : []
      },
    )
    if (grown.length > 0) {
      throw new Error(
        `The compilers of this file used plans an invalidation should have dropped, or left stale paths no rebuild took:\n${grown.join('\n')}`,
      )
    }
  } finally {
    process.chdir(cwd)
    for (const name of Object.keys(process.env)) {
      if (!(name in environment)) {
        delete process.env[name]
      }
    }
    Object.assign(process.env, environment)
  }
})
