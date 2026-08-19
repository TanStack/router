import { parseHref } from '@tanstack/history'
import { bench, describe, expect } from 'vitest'
import { processRouteTree } from '../src/new-process-route-tree'
import { interpolatePath } from '../src/path'
import { parseSearchWith } from '../src/searchParams'

const hrefs = [
  '/posts/123?sort=newest#comments',
  '/files/report.pdf#download',
  '/search?q=router&page=2',
  '/plain/path',
]
const interpolationCases = [
  {
    path: '/teams/$team/projects/$project',
    params: { team: 'router', project: 'benchmarks' },
  },
  {
    path: '/files/prefix{$file}.json/{-$revision}',
    params: { file: 'results', revision: 'latest' },
  },
  {
    path: '/docs/$',
    params: { _splat: 'guides/data-loading' },
  },
]
const routeTree = {
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
  children: Array.from({ length: 30 }, (_, index) => {
    const path = `/team-${index}/prefix{$project}.json/{-$revision}`
    return { id: path, fullPath: path, path }
  }),
}
const parseSearch = parseSearchWith((search) => search)
const extractionCases: ReadonlyArray<
  readonly [value: string, start: number, end?: number]
> = [
  ['/posts/123?sort=newest#comments', 0, 10],
  ['/files/prefix{$file}.json', 7, 19],
  ['prefix{$project}.json', 7, 15],
  ['0.123456789abcdefghijklmnopqrstuvwxyz', 7],
]
let benchmarkSink = 0

expect(parseHref(hrefs[0]!, undefined)).toMatchObject({
  pathname: '/posts/123',
  search: '?sort=newest',
  hash: '#comments',
})
expect(
  interpolatePath({
    ...interpolationCases[1]!,
    server: false,
  }).interpolatedPath,
).toBe('/files/prefixresults.json/latest')
expect(processRouteTree(routeTree).routesByPath).toHaveProperty(
  '/team-29/prefix{$project}.json/{-$revision}',
)
expect(parseSearch('?sort=newest')).toEqual({ sort: 'newest' })
expect(
  extractionCases.map(([value, start, end]) => value.slice(start, end)),
).toEqual(
  extractionCases.map(([value, start, end]) => value.substring(start, end)),
)

describe('equivalent native string operations', () => {
  bench('substring on proven ordered bounds', () => {
    let size = 0
    for (let index = 0; index < 1_000; index++) {
      for (const [value, start, end] of extractionCases) {
        size += value.substring(start, end).length
      }
    }
    benchmarkSink = size
  })

  bench('slice on proven ordered bounds', () => {
    let size = 0
    for (let index = 0; index < 1_000; index++) {
      for (const [value, start, end] of extractionCases) {
        size += value.slice(start, end).length
      }
    }
    benchmarkSink = size
  })
})

describe('path string operations', () => {
  bench('parse 400 hrefs', () => {
    let size = 0
    for (let index = 0; index < 100; index++) {
      for (const href of hrefs) {
        const result = parseHref(href, undefined)
        size +=
          result.pathname.length + result.search.length + result.hash.length
      }
    }
    benchmarkSink = size
  })

  bench('interpolate 300 path templates', () => {
    let size = 0
    for (let index = 0; index < 100; index++) {
      for (const input of interpolationCases) {
        size += interpolatePath({
          ...input,
          server: false,
        }).interpolatedPath.length
      }
    }
    benchmarkSink = size
  })

  bench('construct a 30-route dynamic tree', () => {
    benchmarkSink = Object.keys(processRouteTree(routeTree).routesByPath).length
  })

  bench('parse 400 search prefixes', () => {
    let size = 0
    for (let index = 0; index < 400; index++) {
      size += Object.keys(parseSearch('?sort=newest&page=2')).length
    }
    benchmarkSink = size
  })
})

void benchmarkSink
