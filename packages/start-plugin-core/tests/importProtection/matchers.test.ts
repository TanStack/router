import { describe, expect, test } from 'vitest'
import {
  compileMatcher,
  compileMatchers,
  matchesAny,
} from '../../src/import-protection-plugin/matchers'

describe('compileMatcher', () => {
  test('matches exact strings', () => {
    const m = compileMatcher('@tanstack/react-start/server')
    expect(m.test('@tanstack/react-start/server')).toBe(true)
    expect(m.test('@tanstack/react-start/client')).toBe(false)
  })

  test('matches glob with *', () => {
    const m = compileMatcher('**/*.server.*')
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
