import { describe, expect, it } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import {
  findRouteMatch as findRouteMatchOld,
  processRouteTree as processRouteTreeOld,
} from './wildcard-suffix-fixture.old'

// seeded PRNG (mulberry32) for reproducibility
function makeRng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEGMENTS = ['a', 'bb', 'ccc', 'file', 'data', 'x']

const WILDCARD_ROUTES = [
  '/{$}.txt',
  '/files/{$}',
  '/files/{$}.json',
  '/files/{$}.tar.gz',
  '/files/pre{$}',
  '/files/pre{$}.json',
  '/pre{$}/data.json',
  '/a/{$}',
  '/a/{$}.md',
  '/a/b/{$}.txt',
  '/Case{$}.TXT',
  '/casesensitive/{$.suffix}',
  '/with/slash/in/{$}a/b',
  '/deep/nest/ed/{$}.log',
]

const STATIC_ROUTES = [
  '/',
  '/files',
  '/files/data.txt',
  '/a',
  '/a/b',
  '/a/b/c',
  '/pre/data.json',
  '/CaseFile.TXT',
]

function pick<T>(rng: () => number, arr: Array<T>): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function randomPath(rng: () => number): string {
  const depth = Math.floor(rng() * 5)
  const segments: Array<string> = []
  for (let i = 0; i < depth; i++) {
    const seg = pick(rng, SEGMENTS)
    // randomly vary case or append extensions to exercise suffix matching
    const roll = rng()
    if (roll < 0.3) segments.push(seg.toUpperCase())
    else if (roll < 0.6)
      segments.push(seg + pick(rng, ['.txt', '.json', '.md', '.tar.gz', '']))
    else segments.push(seg)
  }
  let path = '/' + segments.join('/')
  if (rng() < 0.15) path += '/' // trailing slash
  if (path === '//') path = '/'
  return path
}

/**
 * Differential test for the offset-based wildcard suffix comparison.
 *
 * The suffix check used to allocate `parts.slice(index).join('/')` per
 * candidate; it now compares directly against the tail of `path` using a
 * character offset. This test pins that both implementations agree on the
 * matched route id and raw params across many generated trees/paths,
 * including case-insensitive suffixes, suffixes containing '/', empty
 * remainders shorter than the suffix, and trailing slashes.
 */
describe('wildcard suffix matching (offset-based)', () => {
  it('matches identically to parts.slice(index).join("/") semantics across generated trees and paths', () => {
    const rng = makeRng(1337)
    let checked = 0
    let matched = 0
    for (let iter = 0; iter < 200; iter++) {
      const routes = [
        ...STATIC_ROUTES,
        ...WILDCARD_ROUTES.filter(() => rng() < 0.7),
      ]
      const routeLike = {
        id: '__root__',
        isRoot: true,
        fullPath: '/',
        path: '/',
        children: routes.map((route) => ({
          id: route,
          fullPath: route,
          path: route.replace(/^\/|\/$/g, '') || '/',
        })),
      }
      const treeNew = processRouteTree(routeLike).processedTree
      const treeOld = processRouteTreeOld(routeLike).processedTree

      for (let p = 0; p < 50; p++) {
        const path = randomPath(rng)
        for (const fuzzy of [false, true]) {
          const result = findRouteMatch(path, treeNew, fuzzy)
          const expected = findRouteMatchOld(path, treeOld, fuzzy)
          checked++
          expect(
            { id: result?.route.id, params: result?.rawParams },
            `mismatch for path="${path}" fuzzy=${fuzzy} routes=[${routes.join(',')}]`,
          ).toEqual({ id: expected?.route.id, params: expected?.rawParams })
          if (result) matched++
        }
      }
    }
    expect(checked).toBeGreaterThan(15000)
    // sanity: the workload actually exercised matches, not just misses
    expect(matched).toBeGreaterThan(1000)
  })

  it('handles edge cases: case-insensitivity, "/" in suffix, remainder shorter than suffix', () => {
    const routes = [
      '/case{$}.txt',
      '/CASE{$}.TXT',
      '/multi{$}a/b',
      '/long{$}.tar.gz',
    ]
    const routeLike = {
      id: '__root__',
      isRoot: true,
      fullPath: '/',
      path: '/',
      children: routes.map((route) => ({
        id: route,
        fullPath: route,
        path: route.replace(/^\/|\/$/g, '') || '/',
      })),
    }
    const treeNew = processRouteTree(routeLike).processedTree
    const treeOld = processRouteTreeOld(routeLike).processedTree

    const paths = [
      '/casexyz.txt', // hit
      '/caseXYZ.TXT', // suffix mismatch when case-insensitive (default)
      '/CASEabc.TXT', // hit (segment stored uppercase + caseSensitive?)
      '/multifoo/a/b', // suffix containing '/'
      '/multibara/b', // prefix+suffix with '/'
      '/lon.tar.gz', // remainder before wildcard shorter than needed
      '/lo.g', // way too short
      '/longfile.name.tar.gz', // hit with dot-containing splat
      '/case/', // trailing slash, empty remainder
    ]
    for (const path of paths) {
      for (const fuzzy of [false, true]) {
        expect(
          {
            id: findRouteMatch(path, treeNew, fuzzy)?.route.id,
            params: findRouteMatch(path, treeNew, fuzzy)?.rawParams,
          },
          `path="${path}" fuzzy=${fuzzy}`,
        ).toEqual({
          id: findRouteMatchOld(path, treeOld, fuzzy)?.route.id,
          params: findRouteMatchOld(path, treeOld, fuzzy)?.rawParams,
        })
      }
    }
  })
})
