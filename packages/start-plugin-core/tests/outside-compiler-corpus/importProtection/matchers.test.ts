/**
 * Internal control (SPEC §8, V1 ip S24): not part of the compiler test
 * corpus. It calls exported internals of import protection's matchers
 * (literal-pattern classification, matcher arrays, first-match lookup) and
 * gives no clause coverage; a correct rewrite may drop it. How rules match
 * is checked on real apps: integration/importProtection/build-options.test.ts,
 * rule-outcomes.test.ts (literals, near-prefix packages, case-sensitive and
 * stateful `g`/`y` RegExps), default-rules.test.ts (a deep `**` glob, an
 * anchored RegExp) and build.test.ts (the default `*` globs).
 */
import { describe, expect, test } from 'vitest'
import {
  compileMatcher,
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

describe('compileMatcher', () => {
  test('matches exact strings', () => {
    const m = compileMatcher('@tanstack/react-start/server')
    expect(m.literal).toBe('@tanstack/react-start/server')
    expect(m.test('@tanstack/react-start/server')).toBe(true)
    expect(m.test('@tanstack/react-start/client')).toBe(false)
  })

  test('matches glob with *', () => {
    const m = compileMatcher('**/*.server.*')
    expect(m.literal).toBeUndefined()
    expect(m.test('src/utils/db.server.ts')).toBe(true)
    expect(m.test('src/utils/db.client.ts')).toBe(false)
    expect(m.test('secret.server.js')).toBe(true)
  })

  test('matches glob with ** for deep paths', () => {
    const m = compileMatcher('**/.server/**')
    expect(m.test('src/.server/db.ts')).toBe(true)
    expect(m.test('src/.client/ui.ts')).toBe(false)
  })

  test('matches RegExp patterns', () => {
    const m = compileMatcher(/^pg$/)
    expect(m.test('pg')).toBe(true)
    expect(m.test('pg-pool')).toBe(false)
  })

  test('RegExp with global flag is not stateful', () => {
    const m = compileMatcher(/pg/g)
    expect(m.test('pg')).toBe(true)
    // Would fail without resetting lastIndex
    expect(m.test('pg')).toBe(true)
  })
})
