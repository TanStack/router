import { bench, describe } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'

type BenchRoute = {
  id: string
  isRoot?: boolean
  fullPath: string
  path: string
  children?: Array<BenchRoute>
}

const BENCH_OPTIONS = {
  warmupIterations: 100,
  warmupTime: 1_500,
  time: 3_000,
}

let benchmarkSink = 0

function makeRouteTree(routes: Array<string>): BenchRoute {
  return {
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
    children: routes.map((route) => ({
      id: route,
      fullPath: route,
      path: route,
    })),
  }
}

const unitDerivedPatterns = [
  // Derived from the priority and edge-case tests in new-process-route-tree.test.ts.
  '/{-$a}/b',
  '/a/$',
  '/a/{-$b}',
  '/{-$a}/{-$b}/{-$c}/d/e',
  '/{-$a}/{-$b}/c/d/{-$e}',
  '/$a/$b/$c/d/e',
  '/$a/$b/c/d/$e',
  '/users/{-$org}/settings',
  '/users/$id',
  '/{-$other}/posts/new',
  '/posts/$id',
  '/a/{-$b}/',
  '/a/{-$b}/$c',
  '/foo/{-$p}.tsx',
  '/foo/{-$p}/{-$x}.tsx',
  '/file{$}',
  '/{$}/c/file',
]

const unitDerivedMatchPaths = [
  '/a/b',
  '/a/c',
  '/a/b/c',
  '/a/b/c/d/e',
  '/users/settings',
  '/posts/new',
  '/foo/bar.tsx',
  '/file/a/b/c',
  '/x/y/c/file',
]

function prefixed(pattern: string, index: number) {
  return `/g${index}${pattern}`
}

function makeBigRoutes(groupCount: number) {
  const routes: Array<string> = []
  for (let i = 0; i < groupCount; i++) {
    for (const pattern of unitDerivedPatterns) {
      routes.push(prefixed(pattern, i))
    }
  }
  return routes
}

function makeBigMatchPaths(groupCount: number) {
  const paths: Array<string> = []
  for (let i = 0; i < groupCount; i++) {
    for (const path of unitDerivedMatchPaths) {
      paths.push(`/g${i}${path}`)
    }
  }
  return paths
}

const routeSuites = [
  {
    name: 'small route tree',
    routes: unitDerivedPatterns,
    matchPaths: unitDerivedMatchPaths,
    buildIterations: 3_000,
    matchIterations: 3_000,
  },
  {
    name: 'big route tree',
    routes: makeBigRoutes(128),
    matchPaths: makeBigMatchPaths(128),
    buildIterations: 20,
    matchIterations: 20,
  },
]

describe.each(routeSuites)(
  'new process route tree - $name',
  ({ routes, matchPaths, buildIterations, matchIterations }) => {
    const routeTree = makeRouteTree(routes)
    const processedTree = processRouteTree(routeTree).processedTree

    bench(
      `build ${routes.length} routes x ${buildIterations}`,
      () => {
        for (let i = 0; i < buildIterations; i++) {
          const result = processRouteTree(routeTree)
          benchmarkSink ^= result.routesById[routes[0]!] ? 1 : 0
        }
      },
      BENCH_OPTIONS,
    )

    bench(
      `match ${matchPaths.length} paths x ${matchIterations} (uncached)`,
      () => {
        let matches = 0

        for (let i = 0; i < matchIterations; i++) {
          processedTree.matchCache.clear()

          for (const path of matchPaths) {
            if (findRouteMatch(path, processedTree)) matches++
          }
        }

        const expectedMatches = matchPaths.length * matchIterations
        if (matches !== expectedMatches) {
          throw new Error(`Expected ${expectedMatches} matches, got ${matches}`)
        }

        benchmarkSink ^= matches
      },
      BENCH_OPTIONS,
    )
  },
)
