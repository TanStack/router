/**
 * Internal control (SPEC §8, V1 ip S24): not part of the compiler test
 * corpus. It calls exported internals of import protection's matchers
 * (literal-pattern classification, matcher arrays, first-match lookup) and
 * gives no clause coverage; a correct rewrite may drop it. How rules match
 * is checked on real apps (integration/importProtection/build-options.test.ts)
 * and by importProtection/matchers.test.ts.
 */
import { describe, expect, test } from 'vitest'
import {
  compileMatchers,
  isLiteralMatcherPattern,
  matchesAny,
} from '../../../src/import-protection/matchers'

describe('isLiteralMatcherPattern', () => {
  test('classifies exact strings as literals', () => {
    expect(isLiteralMatcherPattern('@tanstack/react-start/server')).toBe(true)
    expect(isLiteralMatcherPattern('node:fs')).toBe(true)
  })

  test('classifies glob syntax as non-literal', () => {
    expect(isLiteralMatcherPattern('**/*.server.*')).toBe(false)
    expect(isLiteralMatcherPattern('{pg,postgres}')).toBe(false)
  })
})

describe('compileMatchers', () => {
  test('compiles an array of patterns', () => {
    const matchers = compileMatchers([
      '@tanstack/react-start/server',
      /^node:fs$/,
    ])
    expect(matchers.length).toBe(2)
    expect(matchers[0]!.test('@tanstack/react-start/server')).toBe(true)
    expect(matchers[1]!.test('node:fs')).toBe(true)
  })
})

describe('matchesAny', () => {
  test('returns the matching matcher', () => {
    const matchers = compileMatchers([
      '@tanstack/react-start/server',
      'pg',
      /^node:/,
    ])

    const result = matchesAny('node:fs', matchers)
    expect(result).toBeDefined()
    expect(result!.pattern).toBeInstanceOf(RegExp)
  })

  test('returns undefined when nothing matches', () => {
    const matchers = compileMatchers(['pg'])
    const result = matchesAny('react', matchers)
    expect(result).toBeUndefined()
  })
})
