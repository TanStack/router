import { describe, expect, it } from 'vitest'
import { WarningLedger } from '../src/compiler'
import type { Diagnostic } from '../src/compiler'

function ledger() {
  const reported: Array<[string, string]> = []
  const warnings = new WarningLedger((d, path) => {
    reported.push([path, d.message])
  })
  return { warnings, reported }
}

const warn = (message: string, code?: string): Diagnostic => ({
  severity: 'warning',
  message,
  code,
})

describe('WarningLedger', () => {
  it('reports a (file, reason) once, keyed by the code when there is one', () => {
    const { warnings, reported } = ledger()
    expect(warnings.once('/app/a.ts', warn('first wording', 'parse'))).toBe(
      true,
    )
    // the same reason worded differently (a new position) is not news
    expect(warnings.once('/app/a.ts', warn('second wording', 'parse'))).toBe(
      false,
    )
    // another reason of the file, and the same reason of another file, are
    expect(warnings.once('/app/a.ts', warn('other', 'split'))).toBe(true)
    expect(warnings.once('/app/b.ts', warn('first wording', 'parse'))).toBe(
      true,
    )
    expect(reported).toEqual([
      ['/app/a.ts', 'first wording'],
      ['/app/a.ts', 'other'],
      ['/app/b.ts', 'first wording'],
    ])
  })

  it('keys an uncoded diagnostic by its message', () => {
    const { warnings, reported } = ledger()
    expect(warnings.once('/app/a.ts', warn('x is unused'))).toBe(true)
    expect(warnings.once('/app/a.ts', warn('x is unused'))).toBe(false)
    expect(warnings.once('/app/a.ts', warn('y is unused'))).toBe(true)
    expect(reported.map(([, m]) => m)).toEqual(['x is unused', 'y is unused'])
  })

  it('reset(path) forgets one file, reset() every file', () => {
    const { warnings, reported } = ledger()
    warnings.once('/app/a.ts', warn('m', 'c'))
    warnings.once('/app/b.ts', warn('m', 'c'))
    warnings.reset('/app/a.ts')
    expect(warnings.once('/app/a.ts', warn('m', 'c'))).toBe(true)
    expect(warnings.once('/app/b.ts', warn('m', 'c'))).toBe(false)
    warnings.reset()
    expect(warnings.once('/app/b.ts', warn('m', 'c'))).toBe(true)
    expect(reported.length).toBe(4)
  })
})
