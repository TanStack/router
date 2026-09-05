import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { memoryExecArgv } from '../runtime'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('memory worker configuration', () => {
  it('preserves CodSpeed instrumentation flags in a runnable worker', async () => {
    vi.stubEnv('CODSPEED_ENV', 'test')
    vi.stubEnv('CODSPEED_RUNNER_MODE', 'memory')

    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [codspeedPlugin()],
        test: { execArgv: memoryExecArgv() },
      },
      'serve',
      'benchmark',
    )
    const flags = config.test!.execArgv!
    expect(flags).toContain('--expose-gc')
    expect(flags).toContain('--predictable')
    expect(flags).toContain('--hash-seed=1')

    const output = execFileSync(
      process.execPath,
      [
        ...flags,
        '--trace-opt',
        '--eval',
        `
          if (typeof global.gc !== 'function') {
            throw new Error('Missing GC instrumentation')
          }
          function hot(value) { return value + 1 }
          let total = 0
          for (let index = 0; index < 100000; index++) {
            total += hot(index)
          }
          console.log(total)
        `,
      ],
      { encoding: 'utf8' },
    )
    expect(output).toContain('5000050000')
    expect(output).not.toMatch(/MAGLEV/)
  })

  it.each([undefined, 'simulation', 'instrumentation', 'walltime'])(
    'does not change %s workers',
    (mode) => {
      vi.stubEnv('CODSPEED_ENV', 'test')
      vi.stubEnv('CODSPEED_RUNNER_MODE', mode)
      expect(memoryExecArgv()).toEqual([])
    },
  )
})
