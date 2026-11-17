/**
 * Kept (R169 gate, 2026-11-17): the sole coverage of two Start paths no oracle
 * test reaches yet, to become start-plugin-core behaviour tests: a known pure
 * call read through a namespace import (import protection's effect model),
 * and builder chains through a namespace member or a method the kind has
 * not (Start's builder recognition).
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_RECOGNIZER, RawFactsCache } from '../src/compiler'
import type { RecognizerTable } from '../src/compiler'

describe('target facts: what stays an effect', () => {
  const recognizer = {
    ...EMPTY_RECOGNIZER,
    pureCalls: { 'toy-router': new Set(['getRouteApi']) },
  }
  const effectful = async (files: Record<string, string>, path: string) => {
    const cache = new RawFactsCache({
      readFile: (p) => Promise.resolve(files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      recognizer,
    })
    return (await cache.get(path, 'client')).targetFacts.codeEffects.client
  }
  // a known package's pure call with an impure argument, a call of
  // another export, of a default import that is no namespace, of a
  // module's own function of that name: effects; the plain call is none
  it.each([
    [
      'an impure argument',
      "import { getRouteApi } from 'toy-router'\nimport { id } from './lib'\nexport const { useParams } = getRouteApi(id())",
      true,
    ],
    [
      'the pure call (control)',
      "import { getRouteApi } from 'toy-router'\nexport const { useParams } = getRouteApi('/x')",
      false,
    ],
  ])('a known pure call: %s', async (_, code, effect) => {
    expect(await effectful({ '/app/m.ts': code }, '/app/m.ts')).toBe(effect)
  })
})

describe('target facts: builder chains per environment', () => {
  const table: RecognizerTable = {
    factories: {
      'toy-start': {
        createServerFn: 'serverFn',
        createIsomorphicFn: 'isoFn',
        createServerOnlyFn: 'serverOnly',
        createStart: 'start',
      },
    },
    builderKinds: new Set(['serverFn', 'isoFn']),
    terminal: { serverFn: 'serverFn', isoFn: 'isoFn' },
    envOnlyKinds: { serverOnly: 'server' },
    builderLinks: {
      serverFn: { middleware: 'both', validator: 'server', handler: 'server' },
      isoFn: { server: 'server', client: 'client' },
    },
  }
  const head = `import { createIsomorphicFn, createServerFn, createServerOnlyFn, createStart } from 'toy-start'
import * as Toy from 'toy-start'
import { track } from './track'
`
  const all = { client: true, server: true }
  it.each([
    [
      'a method the kind has not',
      `export const fn = createIsomorphicFn().handler(() => 1)`,
      all,
    ],
    [
      'a namespace member factory of no builder',
      `export const start = Toy.createStart(() => ({}))`,
      all,
    ],
  ])('%s', async (_, code, codeEffects) => {
    const files: Record<string, string> = {
      '/app/m.ts': head + code + '\n',
      '/app/track.ts': 'export const track = () => () => 1\n',
    }
    const cache = (recognizer?: RecognizerTable) =>
      new RawFactsCache({
        readFile: (p) => Promise.resolve(files[p] ?? null),
        loadVirtual: () => Promise.resolve(null),
        recognizer,
      })
    expect(
      (await cache(table).get('/app/m.ts', 'client')).targetFacts.codeEffects,
    ).toEqual(codeEffects)
    // without the builder links, every chain is a call: an effect
    expect(
      (
        await cache({ ...table, builderLinks: undefined }).get(
          '/app/m.ts',
          'client',
        )
      ).targetFacts.codeEffects,
    ).toEqual(all)
  })
})
