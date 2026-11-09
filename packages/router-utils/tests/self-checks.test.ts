/**
 * The compiler's self-checks (`self-checks.ts`): one switch, on in our test
 * runs, where a violated invariant throws; in users' runs a violation is one
 * warning for the module. No public input reaches a violation (it takes a
 * compiler bug), so the warning's wording is checked on the formatter.
 */
import { describe, expect, it } from 'vitest'
import {
  SELF_CHECKS,
  invariantViolated,
  invariantWarning,
} from '../src/compiler/self-checks'

const violation = {
  effect: '`cache` may exist twice, with separate state in two chunks',
  detail:
    'placement: `cache` (/app/src/routes/a.tsx:3), an identity or state, is declared in 2 outputs: env, split:component',
  range: { start: 40, end: 52 },
}

describe('self-checks', () => {
  it('are on in the test runs, where a violated invariant throws', () => {
    expect(SELF_CHECKS).toBe(true)
    expect(() => invariantViolated(violation)).toThrow(violation.detail)
  })

  it('word the warning of a module as an internal compiler error to report', () => {
    const d = invariantWarning(
      '[tanstack-router] ',
      'src/routes/a.tsx',
      violation,
    )
    expect(d).toMatchObject({
      severity: 'warning',
      code: 'internal-invariant',
      range: violation.range,
    })
    expect(d.message).toBe(
      '[tanstack-router] Internal compiler error in src/routes/a.tsx: the compiled output may be wrong (`cache` may exist twice, with separate state in two chunks). Please report it at https://github.com/TanStack/router/issues with this file.',
    )
  })
})
