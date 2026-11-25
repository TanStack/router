/**
 * Controls of the diagnostic collection (diagnostics.ts) on real channels:
 * thrown errors of real transforms, console output, aggregated build errors
 * and warnings, each read with the file and position it names.
 */
import * as esbuild from 'esbuild'
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  captureConsole,
  captureThrow,
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '../src/diagnostics'

const broken = `const a = 1
export const b = (
`

describe('real channels', () => {
  test('an Oxc parse error names the file and the line, whatever its path spelling', async () => {
    const diagnostics = await captureThrow(() =>
      transformWithOxc(broken, '/app/src/a.ts', { lang: 'ts' }),
    )
    expect(diagnostics).toHaveLength(1)
    expectDiagnostic(diagnostics, {
      severity: 'error',
      file: 'src/a.ts',
      root: '/app',
      position: { line: 2 },
    })
    expect(
      findDiagnostics(diagnostics, { file: 'src/a.ts', root: '/other' }),
    ).toEqual([])
    expect(
      findDiagnostics(diagnostics, {
        file: 'src/a.ts',
        root: '/app',
        position: { line: 1 },
      }),
    ).toEqual([])
  })

  test('an esbuild failure reads as one error with its structured location', async () => {
    const diagnostics = await captureThrow(() =>
      esbuild.transform(broken, { loader: 'ts', sourcefile: '/app/src/a.ts' }),
    )
    expectDiagnostic(diagnostics, {
      severity: 'error',
      file: '/app/src/a.ts',
      position: { line: 3, column: 1 },
      times: 1,
    })
  })

  test('captureThrow fails when the run completes', async () => {
    await expect(captureThrow(() => 'fine')).rejects.toThrow()
    await expect(captureThrow(() => Promise.resolve('fine'))).rejects.toThrow()
  })

  test('captureConsole reads console output by severity and restores the console', async () => {
    const before = console.warn
    const { result, diagnostics } = await captureConsole(() => {
      console.warn('[plugin] could not split `loader` in src/routes/a.tsx')
      console.error(new Error('broken'))
      console.info('done')
      return 'result'
    })
    expect(console.warn).toBe(before)
    expect(result).toBe('result')
    expect(diagnostics.map((diagnostic) => diagnostic.severity)).toEqual([
      'warning',
      'error',
      'info',
    ])
    expectDiagnostic(diagnostics, {
      severity: 'warning',
      file: 'src/routes/a.tsx',
      times: 1,
    })
  })

  test('overlapping captureConsole calls keep their own output and restore the console', async () => {
    const before = console.warn
    let releaseFirst!: () => void
    const first = captureConsole(async () => {
      console.warn('first only')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      console.warn('after the second ended')
    })
    const second = await captureConsole(() => {
      console.warn('second only')
    })
    expect(console.warn).not.toBe(before)
    releaseFirst()
    const { diagnostics } = await first
    expect(console.warn).toBe(before)
    expect(second.diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'second only',
    ])
    expect(diagnostics.map((diagnostic) => diagnostic.text)).toEqual([
      'first only',
      'after the second ended',
    ])
  })

  test('an aggregated build error is one error; its warnings and a result’s messages are their own', () => {
    const failure = Object.assign(
      new Error('vite build failed:\nsrc/a.ts (2:3): Unexpected token'),
      {
        errors: ['src/a.ts (2:3): Unexpected token'],
        warnings: ['src/b.ts: a warning'],
      },
    )
    expect(diagnosticsOf(failure).map(({ severity }) => severity)).toEqual([
      'error',
      'warning',
    ])
    expect(
      diagnosticsOf({ warnings: ['one', 'two'], errors: [] }).map(
        ({ severity }) => severity,
      ),
    ).toEqual(['warning', 'warning'])
    expectDiagnostic(diagnosticsOf(failure), {
      severity: 'warning',
      file: 'src/b.ts',
    })
  })

  test('a captured diagnostic keeps its own severity, also among the warnings an error carries', () => {
    const consoleError = {
      severity: 'error' as const,
      text: 'src/b.ts: logged as an error',
      raw: 'src/b.ts: logged as an error',
      source: 'console' as const,
    }
    const failure = Object.assign(new Error('vite build failed'), {
      errors: ['src/a.ts (2:3): Unexpected token'],
      warnings: [consoleError],
    })
    expect(diagnosticsOf([consoleError], 'warning')).toEqual([consoleError])
    expect(diagnosticsOf(failure).map(({ severity }) => severity)).toEqual([
      'error',
      'error',
    ])
    expect(
      findDiagnostics(failure, { severity: 'warning', file: 'src/b.ts' }),
    ).toEqual([])
  })

  test('Rollup-style locations count with 0-based columns', () => {
    const [diagnostic] = diagnosticsOf(
      {
        message: 'Use of eval is strongly discouraged',
        id: '/app/src/a.ts',
        loc: { file: '/app/src/a.ts', line: 4, column: 2 },
      },
      'warning',
    )
    expectDiagnostic(diagnostic!, {
      severity: 'warning',
      file: 'src/a.ts',
      root: '/app',
      position: { line: 4, column: 3 },
    })
  })
})

// Controls of the file and position matcher: a diagnostic meets an
// expectation only with the expected file's own path and its own position.
describe('file and position', () => {
  const warning = (text: string) => [
    { severity: 'warning' as const, text, raw: text },
  ]

  test('a position belongs to the file it follows, not to a later file', () => {
    const nested = warning(
      'src/route.ts:2:9: cannot split\n  imported from src/barrel.ts:11:6',
    )
    const route = { file: 'src/route.ts', root: '/app' }
    expectDiagnostic(nested, { ...route, position: { line: 2, column: 9 } })
    expect(
      findDiagnostics(nested, { ...route, position: { line: 11, column: 6 } }),
    ).toEqual([])
    expectDiagnostic(nested, {
      file: 'src/barrel.ts',
      root: '/app',
      position: { line: 11, column: 6 },
    })
    expect(
      findDiagnostics(nested, {
        file: 'src/barrel.ts',
        root: '/app',
        position: { line: 2, column: 9 },
      }),
    ).toEqual([])
  })

  test('an absolute path names its file only as a whole path', () => {
    const at = { file: '/app/src/route.ts', position: { line: 1, column: 1 } }
    for (const other of [
      '/app/src/route.tsx:1:1',
      '/other/app/src/route.ts:1:1',
      '/app/src/route.ts.map:1:1',
    ]) {
      expect(findDiagnostics(warning(`failed: ${other}`), at)).toEqual([])
    }
    for (const same of [
      'failed: /app/src/route.ts:1:1',
      '    at load (/app/src/route.ts:1:1)',
      'failed: file:///app/src/route.ts:1:1',
      '╭─[/app/src/route.ts:1:1]',
      'failed in /app/src/route.ts.\n1:1',
    ]) {
      expectDiagnostic(warning(same), { ...at, times: 1 })
    }
  })

  test('route groups and parameters are part of the path', () => {
    const login = {
      file: '/app/src/routes/(auth)/login.tsx',
      position: { line: 1, column: 1 },
    }
    const page = { file: '/app/src/routes/[slug]/page.tsx' }
    for (const [text, expected] of [
      ['error in src/routes/(other)/login.tsx:1:1', login],
      ['error in /app/src/routes/(other)/login.tsx:1:1', login],
      ['error in src/routes/[id]/page.tsx:1:1', page],
    ] as const) {
      expect(findDiagnostics(warning(text), expected)).toEqual([])
    }
    for (const [text, expected] of [
      ['error in src/routes/(auth)/login.tsx:1:1', login],
      ['    at load (/app/src/routes/(auth)/login.tsx:1:1)', login],
      ['error in (auth)/login.tsx:1:1', login],
      ['error in src/routes/[slug]/page.tsx', page],
    ] as const) {
      expectDiagnostic(warning(text), { ...expected, times: 1 })
    }
    expect(
      findDiagnostics(warning('error in src/routes/(other)/login.tsx'), {
        file: 'src/routes/(auth)/login.tsx',
        root: '/app',
      }),
    ).toEqual([])
    expect(
      findDiagnostics(warning('error in src/routes/[id]/page.tsx'), {
        file: 'routes/[slug]/page.tsx',
      }),
    ).toEqual([])
  })

  test('output of unknown owner names its file only by its absolute path', () => {
    const shared = (text: string) => [
      { severity: 'warning' as const, text, raw: text, shared: true as const },
    ]
    const expected = {
      file: 'src/routes/index.tsx',
      root: '/tmp/apps/b',
      position: { line: 3, column: 1 },
    }
    expect(
      findDiagnostics(
        shared('[plugin] src/routes/index.tsx:3:1 split'),
        expected,
      ),
    ).toEqual([])
    expect(() =>
      expectDiagnostic(shared('[plugin] src/routes/index.tsx:3:1'), expected),
    ).toThrow(/unknown owner/)
    expect(
      findDiagnostics(shared('[plugin] warned'), { severity: 'warning' }),
    ).toEqual([])
    expectDiagnostic(
      shared('[plugin] /tmp/apps/b/src/routes/index.tsx:3:1 split'),
      { ...expected, times: 1 },
    )
    expect(
      findDiagnostics(
        shared('[plugin] /tmp/apps/a/src/routes/index.tsx:3:1 split'),
        expected,
      ),
    ).toEqual([])
  })
})
