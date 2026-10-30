import { describe, expect, it } from 'vitest'
import { WarningLedger, reportCompileDiagnostics } from '../src/compiler'
import type { Diagnostic, DiagnosticPosition } from '../src/compiler'

const warn = (message: string, code?: string): Diagnostic => ({
  severity: 'warning',
  message,
  code,
})

describe('WarningLedger', () => {
  it('reports a (file, reason and wording) once', () => {
    const warnings = new WarningLedger()
    expect(warnings.once('/app/a.ts', warn('first wording', 'kept'))).toBe(true)
    expect(warnings.once('/app/a.ts', warn('first wording', 'kept'))).toBe(
      false,
    )
    // two findings of one reason are two; another reason of the file, and
    // the same finding of another file, are news
    expect(warnings.once('/app/a.ts', warn('second wording', 'kept'))).toBe(
      true,
    )
    expect(warnings.once('/app/a.ts', warn('first wording', 'split'))).toBe(
      true,
    )
    expect(warnings.once('/app/b.ts', warn('first wording', 'kept'))).toBe(true)
  })

  it('keys an uncoded diagnostic by its message', () => {
    const warnings = new WarningLedger()
    expect(warnings.once('/app/a.ts', warn('x is unused'))).toBe(true)
    expect(warnings.once('/app/a.ts', warn('x is unused'))).toBe(false)
    expect(warnings.once('/app/a.ts', warn('y is unused'))).toBe(true)
  })

  it('reset() forgets every file', () => {
    const warnings = new WarningLedger()
    warnings.once('/app/a.ts', warn('m', 'c'))
    warnings.once('/app/b.ts', warn('m', 'c'))
    expect(warnings.once('/app/b.ts', warn('m', 'c'))).toBe(false)
    warnings.reset()
    expect(warnings.once('/app/a.ts', warn('m', 'c'))).toBe(true)
    expect(warnings.once('/app/b.ts', warn('m', 'c'))).toBe(true)
  })
})

describe('reportCompileDiagnostics', () => {
  const code = 'const a = 1\r\nconst b = 2\u2028const c = 3\n'
  function report(diagnostics: Array<Diagnostic>, ledger: WarningLedger) {
    const out: Array<[string, string, DiagnosticPosition | undefined]> = []
    reportCompileDiagnostics(
      diagnostics,
      '/app/a.ts',
      code,
      ledger,
      {
        error: (d, at) => out.push(['error', d.message, at]),
        warn: (d, at) => out.push(['warn', d.message, at]),
      },
      () => null,
    )
    return out
  }

  it('reports the errors first, then the new warnings, positioned', () => {
    const ledger = new WarningLedger()
    const c = code.indexOf('const c')
    const diagnostics: Array<Diagnostic> = [
      { ...warn('w', 'kept'), range: { start: c, end: c + 1 } },
      { severity: 'error', message: 'e', range: { start: 1, end: 2 } },
    ]
    expect(report(diagnostics, ledger)).toEqual([
      ['error', 'e', { line: 1, column: 1 }],
      // CRLF and U+2028 both end a line
      ['warn', 'w', { line: 3, column: 0 }],
    ])
    // compiled again: the error again, the warning is no news
    expect(report(diagnostics, ledger)).toEqual([
      ['error', 'e', { line: 1, column: 1 }],
    ])
  })

  it('words a parse failure with the compiler’s policy', () => {
    const parse = {
      severity: 'error',
      message: 'Unexpected token',
      by: 'parse',
    } as const
    const out: Array<string> = []
    const sink = {
      error: (d: Diagnostic) => out.push(`error ${d.message}`),
      warn: (d: Diagnostic) => out.push(`warn ${d.message}`),
    }
    reportCompileDiagnostics(
      [parse],
      '/app/a.ts',
      code,
      new WarningLedger(),
      sink,
      (d) => ({
        severity: 'warning',
        code: 'parse',
        message: `cannot parse: ${d.message}`,
      }),
    )
    reportCompileDiagnostics(
      [parse],
      '/app/a.ts',
      code,
      new WarningLedger(),
      sink,
      () => null,
    )
    expect(out).toEqual(['warn cannot parse: Unexpected token'])
  })
})
