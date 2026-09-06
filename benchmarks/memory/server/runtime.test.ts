import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { memoryConfig, memoryExecArgv } from '../runtime'

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
        test: memoryConfig('server'),
      },
      'serve',
      'benchmark',
    )
    const flags = config.test!.execArgv!
    expect(flags).toContain('--expose-gc')
    expect(flags).toContain('--predictable')
    expect(flags).toContain('--hash-seed=1')
    expect(config.test!.setupFiles).toEqual([
      expect.stringMatching(/\/memory\/server\/vitest\.setup\.ts$/),
    ])

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
  })

  it.each([undefined, 'simulation', 'instrumentation', 'walltime'])(
    'does not change %s workers',
    (mode) => {
      vi.stubEnv('CODSPEED_ENV', 'test')
      vi.stubEnv('CODSPEED_RUNNER_MODE', mode)
      expect(memoryExecArgv()).toEqual([])
      expect(memoryConfig('server')).toEqual({ execArgv: [], setupFiles: [] })
    },
  )

  it('allows prior-job WeakRef targets to be collected before measurement', () => {
    vi.stubEnv('CODSPEED_ENV', 'test')
    vi.stubEnv('CODSPEED_RUNNER_MODE', 'memory')
    // Node's TS loader needs Wasm, which --jitless disables. Strip types in
    // the parent, as Vite does for actual benchmark workers.
    const source = stripTypeScriptTypes(
      readFileSync(new URL('../turn.ts', import.meta.url), 'utf8'),
    )
    const runtimeUrl = `data:text/javascript,${encodeURIComponent(source)}`
    const output = execFileSync(
      process.execPath,
      [
        ...memoryExecArgv(),
        '--expose-gc',
        '--input-type=module',
        '--eval',
        `
          const { endMemoryTurn } = await import(${JSON.stringify(runtimeUrl)})
          const ref = (() => new WeakRef({ value: 1 }))()
          await Promise.resolve()
          global.gc()
          console.log(String(ref.deref() !== undefined))
          await endMemoryTurn()
          global.gc()
          console.log(String(ref.deref() === undefined))
        `,
      ],
      { encoding: 'utf8' },
    )
    expect(output.trim()).toBe('true\ntrue')
  })
})
