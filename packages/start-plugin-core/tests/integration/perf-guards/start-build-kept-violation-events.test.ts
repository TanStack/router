/**
 * A violation event `onViolation` keeps after the build keeps nothing of
 * that build alive: a process that builds again and again and collects the
 * events (a dev tool, a CI reporter) holds one plain record per event, not
 * every finished build's compiler session. Counted through the documented
 * stats knob (TSR_COMPILER_STATS=1), with forced garbage collections; this
 * file runs in a process of its own (project `perf-guards`). Rsbuild only:
 * a Vite 8 build's plugins are never released (see
 * start-build-environment-release.test.ts).
 */
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { buildStart } from '../../build-start'

const timeout = 60_000

const files = {
  'src/secret.server.ts': `export const secret = () => 'MARK_SECRET'\n`,
  'src/entry.ts': `import { secret } from './secret.server'
export const read = () => secret
`,
}

test.each([
  ['never read', false],
  ['read while the build runs', true],
] as const)(
  'violation events kept after Rsbuild builds, their trace %s, keep no build alive',
  async (_, readTrace) => {
    vi.stubEnv('TSR_COMPILER_STATS', '1')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const kept: Array<{ trace: ReadonlyArray<{ file: string }> }> = []
    const builds = 3
    for (let build = 0; build < builds; build++) {
      await buildStart({
        bundler: 'rsbuild',
        files,
        entry: 'src/entry.ts',
        start: {
          importProtection: {
            behavior: 'mock',
            mockAccess: 'off',
            onViolation: (info) => {
              if (readTrace) {
                void info.trace
              }
              kept.push(info)
            },
          },
        },
      })
    }
    setFlagsFromString('--expose-gc')
    const gc = runInNewContext('gc') as () => void
    for (let round = 0; round < 5; round++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      gc()
    }
    // one event per build (the client's import of the denied file)
    expect(kept).toHaveLength(builds)
    // (at most one is left: the schema library memoises the last value it
    // parsed, here the last build's options)
    expect(
      compilerStats()['start:rsbuild:session']?.instances ?? 0,
    ).toBeLessThan(builds)
    // the events still name the chain that brought the import
    for (const event of kept) {
      expect(event.trace.at(-1)?.file).toMatch(/src\/entry\.ts$/)
    }
  },
  timeout,
)
