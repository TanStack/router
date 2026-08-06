import { bench, describe, expect } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'

type BenchRoute = {
  id: string
  fullPath: string
  path?: string
  isRoot?: boolean
  children?: Array<BenchRoute>
  options?: {
    caseSensitive?: boolean
  }
}

function createStaticTree(caseSensitive: boolean, shared: boolean): BenchRoute {
  return {
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    path: '/',
    children: Array.from({ length: 256 }, (_, index) => {
      const section = shared ? index % 16 : index
      const path = `/section-${section}/item-${index}`
      return {
        id: path,
        fullPath: path,
        path: path.slice(1),
        options: { caseSensitive },
      }
    }),
  }
}

const insensitiveShared = createStaticTree(false, true)
const insensitiveUnique = createStaticTree(false, false)
const sensitiveShared = createStaticTree(true, true)
const sensitiveUnique = createStaticTree(true, false)

const insensitiveResult = processRouteTree(insensitiveShared)
expect(
  findRouteMatch('/SECTION-3/ITEM-99', insensitiveResult.processedTree)?.route
    .id,
).toBe('/section-3/item-99')
expect(
  insensitiveResult.processedTree.segmentTree.staticInsensitive?.size,
).toBe(16)

const sensitiveResult = processRouteTree(sensitiveShared)
expect(
  findRouteMatch('/section-3/item-99', sensitiveResult.processedTree)?.route.id,
).toBe('/section-3/item-99')
expect(
  findRouteMatch('/SECTION-3/ITEM-99', sensitiveResult.processedTree),
).toBe(null)
expect(sensitiveResult.processedTree.segmentTree.static?.size).toBe(16)

let benchmarkSink = 0

function buildTrees(tree: BenchRoute, caseSensitive: boolean) {
  for (let i = 0; i < 10; i++) {
    const root = processRouteTree(tree).processedTree.segmentTree
    benchmarkSink += caseSensitive
      ? (root.static?.size ?? 0)
      : (root.staticInsensitive?.size ?? 0)
  }
}

describe('static route tree construction', () => {
  bench('build 10 insensitive trees with shared prefixes', () => {
    buildTrees(insensitiveShared, false)
  })

  bench('build 10 insensitive trees with unique prefixes', () => {
    buildTrees(insensitiveUnique, false)
  })

  bench('build 10 sensitive trees with shared prefixes', () => {
    buildTrees(sensitiveShared, true)
  })

  bench('build 10 sensitive trees with unique prefixes', () => {
    buildTrees(sensitiveUnique, true)
  })
})

void benchmarkSink
