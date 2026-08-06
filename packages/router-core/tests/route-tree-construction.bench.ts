import { bench, describe, expect } from 'vitest'
import {
  findFlatMatch,
  findRouteMatch,
  processRouteMasks,
  processRouteTree,
} from '../src/new-process-route-tree'

type BenchRoute = {
  id: string
  fullPath: string
  path?: string
  isRoot?: boolean
  children?: Array<BenchRoute>
  options?: {
    caseSensitive?: boolean
    params?: {
      parse?: (params: Record<string, string>) => unknown
      priority?: number
    }
  }
}

const mostlyStaticTree: BenchRoute = {
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
  children: Array.from({ length: 256 }, (_, index) => ({
    id: `/section-${index % 16}/item-${index}`,
    fullPath: `/section-${index % 16}/item-${index}`,
    path: `section-${index % 16}/item-${index}`,
  })),
}

const dynamicPatterns = [
  '$value',
  'pre{$value}',
  '{$value}suf',
  'pre{$value}suf',
  '{-$value}',
  'pre{-$value}',
  '{-$value}suf',
  'pre{-$value}suf',
  '$',
  'pre{$}',
  '{$}suf',
  'pre{$}suf',
]

const denseDynamicTree: BenchRoute = {
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
  children: Array.from({ length: 16 }, (_, group) =>
    dynamicPatterns.map((pattern, index) => ({
      id: `/group-${group}/${pattern}`,
      fullPath: `/group-${group}/${pattern}`,
      path: `group-${group}/${pattern}`,
      options: {
        params:
          index % 3 === 0
            ? {
                parse: (params: Record<string, string>) => params,
                priority: index % 4,
              }
            : undefined,
      },
    })),
  ).flat(),
}

const reusedDynamicTree: BenchRoute = {
  id: '__root__',
  isRoot: true,
  fullPath: '/',
  path: '/',
  children: Array.from({ length: 256 }, (_, index) => ({
    id: `/shared/$value/item-${index}`,
    fullPath: `/shared/$value/item-${index}`,
    path: `shared/$value/item-${index}`,
  })),
}

const maskBase = processRouteTree({
  id: '__root__',
  isRoot: true,
  fullPath: '/',
}).processedTree
const routeMasks = dynamicPatterns.map((pattern) => ({
  from: `/group/${pattern}`,
  routeTree: denseDynamicTree,
}))

const staticResult = processRouteTree(mostlyStaticTree)
expect(
  findRouteMatch('/section-3/item-99', staticResult.processedTree)?.route.id,
).toBe('/section-3/item-99')

const dynamicResult = processRouteTree(denseDynamicTree)
expect(
  findRouteMatch('/group-0/prexsuf', dynamicResult.processedTree)?.route.id,
).toBe('/group-0/pre{$value}suf')
const denseBranch =
  dynamicResult.processedTree.segmentTree.staticInsensitive?.get('group-0')
expect(denseBranch?.dynamic?.map((node) => node.fullPath)).toEqual([
  '/group-0/pre{$value}suf',
  '/group-0/$value',
  '/group-0/pre{$value}',
  '/group-0/{$value}suf',
])
expect(denseBranch?.optional?.map((node) => node.fullPath)).toEqual([
  '/group-0/{-$value}suf',
  '/group-0/pre{-$value}suf',
  '/group-0/pre{-$value}',
  '/group-0/{-$value}',
])
expect(denseBranch?.wildcard?.map((node) => node.fullPath)).toEqual([
  '/group-0/pre{$}',
  '/group-0/pre{$}suf',
  '/group-0/{$}suf',
  '/group-0/$',
])

const reusedResult = processRouteTree(reusedDynamicTree)
expect(
  reusedResult.processedTree.segmentTree.staticInsensitive?.get('shared')
    ?.dynamic,
).toHaveLength(1)

processRouteMasks(routeMasks, maskBase)
expect(findFlatMatch('/group/prexsuf', maskBase)?.route.from).toBe(
  '/group/pre{$value}suf',
)

let benchmarkSink = 0

describe('route tree construction', () => {
  bench('build 10 mostly static route trees', () => {
    for (let i = 0; i < 10; i++) {
      benchmarkSink +=
        processRouteTree(mostlyStaticTree).processedTree.segmentTree
          .staticInsensitive?.size ?? 0
    }
  })

  bench('build 10 dense dynamic route trees', () => {
    for (let i = 0; i < 10; i++) {
      benchmarkSink +=
        processRouteTree(denseDynamicTree).processedTree.segmentTree
          .staticInsensitive?.size ?? 0
    }
  })

  bench('build 10 same-shape dynamic route trees', () => {
    for (let i = 0; i < 10; i++) {
      benchmarkSink +=
        processRouteTree(
          reusedDynamicTree,
        ).processedTree.segmentTree.staticInsensitive?.get('shared')?.dynamic
          ?.length ?? 0
    }
  })

  bench('build 10 dense route-mask trees', () => {
    for (let i = 0; i < 10; i++) {
      processRouteMasks(routeMasks, maskBase)
      const group = maskBase.masksTree?.staticInsensitive?.get('group')
      benchmarkSink +=
        (group?.dynamic?.length ?? 0) +
        (group?.optional?.length ?? 0) +
        (group?.wildcard?.length ?? 0)
    }
  })
})

void benchmarkSink
