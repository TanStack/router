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
