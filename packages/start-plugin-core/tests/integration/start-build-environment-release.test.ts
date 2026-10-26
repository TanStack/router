/**
 * A production build releases each environment's compiler state once that
 * environment is built (issue #8794: a build of several environments kept
 * every finished environment's compiler state until the whole build ended,
 * so the heap grew with each environment). Start builds the client, then the
 * SSR environment (build-harness.ts): when the SSR build starts, the client's
 * plans and import-protection state are gone, and the SSR build has its own.
 * Measured through the documented stats knob (TSR_COMPILER_STATS=1, read in
 * the build's process by a plugin of the app); this file runs in a process
 * of its own (project `integration-alone`), so the counts are this build's.
 */
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { buildStart, startBundlers } from '../build-harness'
import type { StartBundler } from '../build-harness'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'
import type { Plugin } from 'vite'

const timeout = 60_000

const files = {
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(() => 'MARK_GREETING')
`,
  'entry.ts': `export { getGreeting } from './src/fns'\n`,
}

interface Counts {
  /** Plans of every environment of the build's compiler session. */
  plans: number
  /** Environments import protection holds state for. */
  importProtectionEnvs: number
}

/** The SSR environment's counts when its build starts and when its bundle is written. */
type Probe = Partial<Record<'start' | 'end', Counts>>

function counts(bundler: StartBundler): Counts {
  const stats = compilerStats()
  return {
    plans: stats[`start:${bundler}`]?.plans ?? 0,
    importProtectionEnvs: stats[`start:${bundler}:session`]?.['ip.envs'] ?? 0,
  }
}

function viteProbe(probe: Probe): Plugin {
  return {
    name: 'test-probe-compiler-state',
    apply: 'build',
    buildStart() {
      if (this.environment.name === 'ssr') {
        probe.start = counts('vite')
      }
    },
    writeBundle() {
      if (this.environment.name === 'ssr') {
        probe.end = counts('vite')
      }
    },
  }
}

function rsbuildProbe(probe: Probe): RsbuildPlugin {
  return {
    name: 'test-probe-compiler-state',
    setup(api) {
      api.modifyRspackConfig((config, { environment }) => {
        if (environment.name !== 'ssr') {
          return
        }
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.make.tap(
              { name: 'test-probe-compiler-state', stage: -100 },
              () => {
                probe.start = counts('rsbuild')
              },
            )
            compiler.hooks.afterEmit.tap('test-probe-compiler-state', () => {
              probe.end = counts('rsbuild')
            })
          },
        })
      })
    },
  }
}

describe.each(startBundlers)(
  'a %s build of several environments',
  (bundler) => {
    test(
      'releases the client compiler state before the SSR environment builds',
      async () => {
        vi.stubEnv('TSR_COMPILER_STATS', '1')
        onTestFinished(() => {
          vi.unstubAllEnvs()
        })
        const probe: Probe = {}
        const { ssr } = await buildStart({
          bundler,
          files,
          ...(bundler === 'vite'
            ? { viteConfig: { plugins: [viteProbe(probe)] } }
            : { rsbuildConfig: { plugins: [rsbuildProbe(probe)] } }),
        })
        expect(ssr.where('MARK_GREETING')).not.toBe('nowhere')
        // the client built first: nothing of it is left
        expect(probe.start).toEqual({ plans: 0, importProtectionEnvs: 1 })
        // the SSR build compiles with its own state, released after it
        expect(probe.end!.plans).toBeGreaterThan(0)
        expect(probe.end!.importProtectionEnvs).toBe(1)
        expect(counts(bundler).plans).toBe(0)
      },
      timeout,
    )
  },
)
