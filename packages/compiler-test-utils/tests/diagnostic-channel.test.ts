/**
 * Controls of the one diagnostic channel (diagnostic-channel.ts; SPEC §5.7,
 * N15–N17): it merges every channel a compiler or a tool may report on
 * (console, the process streams, Vite's logger, a bundler compilation), in
 * order and scoped, and "nothing reported" reads them all: a warning on any
 * one channel fails it, while info output does not.
 */
import { describe, expect, test } from 'vitest'
import {
  captureDiagnostics,
  expectNoProblems,
  openDiagnosticChannel,
  problems,
} from '../src/diagnostic-channel'
import { withBuildEnvironment } from '../src/build-harness'
import { captureConsole, expectDiagnostic } from '../src/diagnostics'

describe('diagnostic channel', () => {
  test('merges console, process streams, Vite logger and compilation reports in order, with their source', async () => {
    const { diagnostics } = await captureDiagnostics((channel) => {
      console.warn('console warning in src/a.ts')
      process.stderr.write('stderr warning\n')
      process.stdout.write('stdout line\n')
      const logger = channel.viteLogger()
      logger.info('vite info')
      logger.warn('vite warning')
      logger.error('vite error', {
        error: Object.assign(new Error('transform failed'), {
          id: '/app/src/b.ts',
          loc: { file: '/app/src/b.ts', line: 3, column: 4 },
        }),
      })
      channel.reportCompilation({
        errors: [{ message: 'Module not found', moduleName: './src/c.ts' }],
        warnings: [{ message: 'a compilation warning' }],
      })
      console.info('done')
    })
    expect(
      diagnostics.map(({ source, severity }) => `${source} ${severity}`),
    ).toEqual([
      'console warning',
      'stderr warning',
      'stdout info',
      'vite info',
      'vite warning',
      'vite error',
      'bundler error',
      'bundler warning',
      'console info',
    ])
    // The logger's error object gives its structured location, 1-based
    expectDiagnostic(diagnostics, {
      severity: 'error',
      file: 'src/b.ts',
      root: '/app',
      position: { line: 3, column: 5 },
    })
    expectDiagnostic(diagnostics, { severity: 'error', file: 'src/c.ts' })
  })

  test('scope() and since() give what a step reported; close() stops recording', async () => {
    const channel = openDiagnosticChannel()
    try {
      channel.run(() => console.warn('before'))
      const mark = channel.mark()
      const { result, diagnostics } = await channel.scope(async () => {
        await Promise.resolve()
        console.warn('during')
        return 'result'
      })
      expect(result).toBe('result')
      expect(diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
        'during',
      ])
      expect(channel.since(mark).map((diagnostic) => diagnostic.text)).toEqual([
        'during',
      ])
    } finally {
      channel.close()
    }
    const before = channel.diagnostics.length
    // Closed: the console is back, nothing more is recorded
    const { diagnostics } = await captureConsole(() => {
      console.warn('after close')
    })
    expect(diagnostics).toHaveLength(1)
    expect(channel.diagnostics).toHaveLength(before)
  })

  test('nests with captureConsole in any order, and restores the console and streams', async () => {
    const original = {
      warn: console.warn,
      stderr: process.stderr.write,
    }
    const outer = openDiagnosticChannel()
    const inner = await outer.run(() =>
      captureConsole(() => {
        console.warn('both')
      }),
    )
    outer.close()
    expect(console.warn).toBe(original.warn)
    expect(process.stderr.write).toBe(original.stderr)
    expect(inner.diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'both',
    ])
    expect(outer.diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'both',
    ])
  })

  // N15: "nothing reported" reads every channel. A check that read only
  // Vite's logger (the old dev harness `logs`) or only the compilation
  // (the old Rsbuild `diagnostics`) misses a compiler warning through
  // the console or the streams.
  test.each([
    ['console.warn', () => console.warn('[plugin] could not split')],
    ['console.error', () => console.error('[plugin] failed')],
    ['stderr', () => process.stderr.write('[plugin] warning\n')],
    [
      'Vite logger',
      (channel: ReturnType<typeof openDiagnosticChannel>) =>
        channel.viteLogger().warn('[plugin] warning'),
    ],
    [
      'compilation',
      (channel: ReturnType<typeof openDiagnosticChannel>) =>
        channel.reportCompilation({ warnings: [{ message: 'warning' }] }),
    ],
  ] as const)(
    'expectNoProblems fails on a warning reported through %s',
    async (_, report) => {
      const { diagnostics } = await captureDiagnostics((channel) => {
        report(channel)
      })
      expect(problems(diagnostics)).toHaveLength(1)
      expect(() => expectNoProblems(diagnostics)).toThrow(
        /expected no warning or error on any channel/,
      )
    },
  )

  test('expectNoProblems passes on info output only (N15: no warning is not no output)', async () => {
    const { diagnostics } = await captureDiagnostics((channel) => {
      console.log('generated the route tree')
      console.info('built in 12 ms')
      process.stdout.write('progress\n')
      channel.viteLogger().info('page reload src/a.ts')
    })
    expect(diagnostics).toHaveLength(4)
    expectNoProblems(diagnostics)
  })
})

// Overlapping async work must keep each capture's output, including streams.
test('concurrent captures do not receive each other’s output', async () => {
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const [first, second] = await Promise.all([
    captureDiagnostics(async () => {
      await ready
      console.warn('first console')
      process.stderr.write('first stream\n')
    }),
    captureDiagnostics(async () => {
      console.warn('second console')
      release()
      await ready
      process.stderr.write('second stream\n')
    }),
  ])
  expect(first.diagnostics.map(({ text }) => text)).toEqual([
    'first console',
    'first stream',
  ])
  expect(second.diagnostics.map(({ text }) => text)).toEqual([
    'second console',
    'second stream',
  ])
})

test('overlapping build-environment captures keep only their own console output', async () => {
  const first: Array<string> = []
  const second: Array<string> = []
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  const nodeEnv = process.env.NODE_ENV ?? null
  await Promise.all([
    withBuildEnvironment(nodeEnv, first, async () => {
      await ready
      console.warn('first build')
      process.stderr.write('first build stream\n')
    }),
    withBuildEnvironment(nodeEnv, second, async () => {
      console.warn('second build')
      process.stderr.write('second build stream\n')
      release()
      await ready
    }),
  ])
  expect(first).toEqual(['first build', 'first build stream'])
  expect(second).toEqual(['second build', 'second build stream'])
})
