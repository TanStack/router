import { afterEach, describe, expect, it, vi } from 'vitest'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { resolveConfig } from 'vite'
import { cpuSimulationExecArgv } from '../cpu-simulation'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('CPU simulation worker configuration', () => {
  it.each(['simulation', 'instrumentation'])(
    'preserves stock CodSpeed flags in %s workers',
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
          '--predictable',
          '--hash-seed=1',
          '--random-seed=1',
          '--expose-gc',
        ]),
      )

      expect(cpuSimulationExecArgv()).toEqual([])
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
