import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { resolveConfig } from 'vite'
import { cpuSimulationExecArgv } from '../cpu-simulation'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('CPU simulation worker configuration', () => {
  it.each(['simulation', 'instrumentation'])(
    'keeps Maglev disabled in %s workers alongside CodSpeed flags',
    async (mode) => {
      vi.stubEnv('CODSPEED_ENV', 'test')
      vi.stubEnv('CODSPEED_RUNNER_MODE', mode)

      const config = await resolveConfig(
        {
          configFile: false,
          plugins: [codspeedPlugin()],
          test: { execArgv: cpuSimulationExecArgv() },
        },
        'serve',
        'benchmark',
      )

      expect(config.test?.execArgv).toEqual(
        expect.arrayContaining([
          '--no-opt',
          '--no-maglev',
          '--predictable',
          '--hash-seed=1',
          '--random-seed=1',
          '--expose-gc',
        ]),
      )

      // On Node 24, --no-opt alone still lets Maglev optimize hot functions.
      // Exercise the resolved worker flags, not just the helper's return value.
      const result = spawnSync(
        process.execPath,
        [
          ...config.test!.execArgv!,
          '--trace-opt',
          '-e',
          `
            function increment(value) { return value + 1 }
            let total = 0
            for (let i = 0; i < 100_000; i++) { total = increment(total) }
            process.stdout.write(String(total))
          `,
        ],
        { encoding: 'utf8' },
      )
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout.trim()).toBe('100000')
      expect(result.stderr).not.toContain('MAGLEV')
    },
  )

  it('leaves uninstrumented benchmarks unchanged when a shell mode is set', () => {
    vi.stubEnv('CODSPEED_ENV', undefined)
    vi.stubEnv('CODSPEED_RUNNER_MODE', 'simulation')
    expect(cpuSimulationExecArgv()).toEqual([])
  })

  it.each(['walltime', 'memory', undefined])(
    'preserves runtime behavior outside CPU simulation (%s)',
    (mode) => {
      vi.stubEnv('CODSPEED_ENV', 'test')
      vi.stubEnv('CODSPEED_RUNNER_MODE', mode)
      expect(cpuSimulationExecArgv()).toEqual([])
    },
  )
})
