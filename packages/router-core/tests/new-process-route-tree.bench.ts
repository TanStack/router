import { bench, describe } from 'vitest'
import {
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
    parseParams?: (params: Record<string, string>) => unknown
    params?: {
      parse?: (params: Record<string, string>) => unknown
      priority?: number
    }
  }
}

type BenchMask = {
  from: string
}

const sectionCount = 8

function makeRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: Array.from({ length: sectionCount }, (_, section) => {
      const prefix = `/section-${section}`
      const children: Array<BenchRoute> = [
        { id: `${prefix}/`, fullPath: `${prefix}/`, path: '/' },
      ]

      for (let page = 0; page < 12; page++) {
        children.push({
          id: `${prefix}/static/page-${page}`,
          fullPath: `${prefix}/static/page-${page}`,
          path: `static/page-${page}`,
        })
        children.push({
          id: `${prefix}/items/$item${page}`,
          fullPath: `${prefix}/items/$item${page}`,
          path: `items/$item${page}`,
        })
        children.push({
          id: `${prefix}/files/file-{$file${page}}.txt`,
          fullPath: `${prefix}/files/file-{$file${page}}.txt`,
          path: `files/file-{$file${page}}.txt`,
        })
      }

      children.push(
        {
          id: `${prefix}/archive/{-$year}/month-{-$month}/index`,
          fullPath: `${prefix}/archive/{-$year}/month-{-$month}/index`,
          path: 'archive/{-$year}/month-{-$month}/index',
        },
        {
          id: `${prefix}/docs/{$}.md`,
          fullPath: `${prefix}/docs/{$}.md`,
          path: 'docs/{$}.md',
        },
        {
          id: `${prefix}/$org/_layout`,
          fullPath: `${prefix}/$org`,
          path: '$org',
          options: {
            params: { parse: (params) => params },
          },
          children: [
            {
              id: `${prefix}/$org/_layout/settings`,
              fullPath: `${prefix}/$org/settings`,
              path: 'settings',
            },
            {
              id: `${prefix}/$org/_layout/report_{-$range}`,
              fullPath: `${prefix}/$org/report_{-$range}`,
              path: 'report_{-$range}',
            },
          ],
        },
      )

      return {
        id: prefix,
        fullPath: prefix,
        path: `section-${section}`,
        options: section % 2 ? { caseSensitive: true } : undefined,
        children,
      }
    }),
  }
}

function makeStaticHeavyRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: Array.from({ length: 48 }, (_, section) => {
      const prefix = `/static-heavy/section-${section}`
      return {
        id: prefix,
        fullPath: prefix,
        path: `static-heavy/section-${section}`,
        children: Array.from({ length: 16 }, (_, page) => ({
          id: `${prefix}/page-${page}/$id`,
          fullPath: `${prefix}/page-${page}/$id`,
          path: `page-${page}/$id`,
        })),
      }
    }),
  }
}

function makeStaticHeavyMasks(): Array<BenchMask> {
  const masks: Array<BenchMask> = []
  for (let section = 0; section < 48; section++) {
    for (let page = 0; page < 16; page++) {
      masks.push({ from: `/static-heavy/section-${section}/page-${page}/$id` })
    }
  }
  return masks
}

function makeSortableFanoutRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: [
      {
        id: '/sort',
        fullPath: '/sort',
        path: 'sort',
        children: Array.from({ length: 64 }, (_, index) => ({
          id: `/sort/prefix-${index}{$value}.suffix-${index}`,
          fullPath: `/sort/prefix-${index}{$value}.suffix-${index}`,
          path: `prefix-${index}{$value}.suffix-${index}`,
          options: {
            params: { priority: index % 4 },
          },
        })),
      },
    ],
  }
}

function makeSortableFanoutMasks(): Array<BenchMask> {
  return Array.from({ length: 64 }, (_, index) => ({
    from: `/sort/prefix-${index}{$value}.suffix-${index}`,
  }))
}

function makeParsedPriorityFanoutRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: [
      {
        id: '/priority',
        fullPath: '/priority',
        path: 'priority',
        children: Array.from({ length: 64 }, (_, index) => ({
          id: `/priority/item-{$value}-${index}`,
          fullPath: `/priority/item-{$value}-${index}`,
          path: `item-{$value}-${index}`,
          options: {
            params: {
              parse: (params) => params,
              priority: index % 8,
            },
          },
        })),
      },
    ],
  }
}

function makeOptionalFanoutRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: [
      {
        id: '/optional',
        fullPath: '/optional',
        path: 'optional',
        children: Array.from({ length: 64 }, (_, index) => ({
          id: `/optional/prefix-${index}{-$value}.suffix-${index}`,
          fullPath: `/optional/prefix-${index}{-$value}.suffix-${index}`,
          path: `prefix-${index}{-$value}.suffix-${index}`,
        })),
      },
    ],
  }
}

function makeWildcardFanoutRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: [
      {
        id: '/wildcard',
        fullPath: '/wildcard',
        path: 'wildcard',
        children: Array.from({ length: 64 }, (_, index) => ({
          id: `/wildcard/prefix-${index}{$}.suffix-${index}`,
          fullPath: `/wildcard/prefix-${index}{$}.suffix-${index}`,
          path: `prefix-${index}{$}.suffix-${index}`,
        })),
      },
    ],
  }
}

function makeDecodeRouteTree(): BenchRoute {
  return {
    id: '__root__',
    fullPath: '/',
    path: '/',
    isRoot: true,
    children: [
      {
        id: '/decode/$first/file-{$second}.txt/{-$third}/docs/{$}.md',
        fullPath: '/decode/$first/file-{$second}.txt/{-$third}/docs/{$}.md',
        path: 'decode/$first/file-{$second}.txt/{-$third}/docs/{$}.md',
      },
    ],
  }
}

function makeDecodePaths(encoded: boolean): Array<string> {
  return Array.from({ length: 1200 }, (_, index) => {
    const space = encoded ? '%20' : '-'
    return `/decode/first${space}${index}/file-second${space}${index}.txt/third${space}${index}/docs/path${space}to/file-${index}.md`
  })
}

function makeMixedDecodePaths(): Array<string> {
  return Array.from({ length: 1200 }, (_, index) => {
    const space = index % 10 === 0 ? '%20' : '-'
    return `/decode/first${space}${index}/file-second${space}${index}.txt/third${space}${index}/docs/path${space}to/file-${index}.md`
  })
}

function verifyRouteTreeBench() {
  const { processedTree } = processRouteTree(makeRouteTree())
  const cases: Array<[path: string, expectedId: string, fuzzy?: boolean]> = [
    ['/section-3/static/page-8', '/section-3/static/page-8'],
    ['/section-4/items/abc', '/section-4/items/$item0'],
    ['/section-2/files/file-abc.txt', '/section-2/files/file-{$file0}.txt'],
    [
      '/section-5/archive/2024/month-9/index',
      '/section-5/archive/{-$year}/month-{-$month}/index',
    ],
    [
      '/section-5/archive/month-9/index',
      '/section-5/archive/{-$year}/month-{-$month}/index',
    ],
    ['/section-1/docs/path/to/file.md', '/section-1/docs/{$}.md'],
    ['/section-6/acme/settings', '/section-6/$org/_layout/settings'],
    [
      '/section-6/acme/settings/details',
      '/section-6/$org/_layout/settings',
      true,
    ],
  ]

  for (const [path, expectedId, fuzzy] of cases) {
    const routeId = findRouteMatch(path, processedTree, fuzzy)?.route.id
    if (routeId !== expectedId) {
      throw new Error(`Expected ${path} to match ${expectedId}, got ${routeId}`)
    }
  }
}

verifyRouteTreeBench()

function verifyDecodeBench() {
  const processed = processRouteTree(makeDecodeRouteTree()).processedTree
  const plain = findRouteMatch(makeDecodePaths(false)[0]!, processed)
  if (plain?.rawParams.first !== 'first-0') {
    throw new Error(
      `Expected plain param decode, got ${plain?.rawParams.first}`,
    )
  }

  const encoded = findRouteMatch(makeDecodePaths(true)[0]!, processed)
  if (encoded?.rawParams.first !== 'first 0') {
    throw new Error(
      `Expected encoded param decode, got ${encoded?.rawParams.first}`,
    )
  }
}

verifyDecodeBench()

describe('new process route tree', () => {
  const routeTree = makeRouteTree()
  const staticHeavyTree = makeStaticHeavyRouteTree()
  const sortableFanoutTree = makeSortableFanoutRouteTree()
  const parsedPriorityFanoutTree = makeParsedPriorityFanoutRouteTree()
  const optionalFanoutTree = makeOptionalFanoutRouteTree()
  const wildcardFanoutTree = makeWildcardFanoutRouteTree()
  const staticHeavyMasks = makeStaticHeavyMasks()
  const sortableFanoutMasks = makeSortableFanoutMasks()
  const masksProcessed = processRouteTree(makeRouteTree()).processedTree
  const decodeProcessed = processRouteTree(makeDecodeRouteTree()).processedTree
  const sortableFanoutProcessed =
    processRouteTree(sortableFanoutTree).processedTree
  const encodedDecodePaths = makeDecodePaths(true)
  const plainDecodePaths = makeDecodePaths(false)
  const mixedDecodePaths = makeMixedDecodePaths()
  let encodedDecodeIndex = 0
  let plainDecodeIndex = 0
  let mixedDecodeIndex = 0

  bench('processRouteTree mixed tree', () => {
    processRouteTree(routeTree)
  })

  bench('processRouteTree static-heavy singleton dynamics', () => {
    processRouteTree(staticHeavyTree)
  })

  bench('processRouteTree sortable dynamic fanout', () => {
    processRouteTree(sortableFanoutTree)
  })

  bench('processRouteTree parsed priority fanout', () => {
    processRouteTree(parsedPriorityFanoutTree)
  })

  bench('processRouteTree optional fanout', () => {
    processRouteTree(optionalFanoutTree)
  })

  bench('processRouteTree wildcard fanout', () => {
    processRouteTree(wildcardFanoutTree)
  })

  bench('processRouteMasks static-heavy singleton dynamics', () => {
    processRouteMasks(staticHeavyMasks, masksProcessed)
  })

  bench('processRouteMasks sortable dynamic fanout', () => {
    processRouteMasks(sortableFanoutMasks, masksProcessed)
  })

  bench('findRouteMatch decode encoded params uncached batch', () => {
    for (let index = 0; index < 16; index++) {
      const path =
        encodedDecodePaths[
          (encodedDecodeIndex + index) % encodedDecodePaths.length
        ]!
      if (!findRouteMatch(path, decodeProcessed)) {
        throw new Error(`No encoded decode match for ${path}`)
      }
    }
    encodedDecodeIndex = (encodedDecodeIndex + 16) % encodedDecodePaths.length
  })

  bench('findRouteMatch decode plain params uncached batch', () => {
    for (let index = 0; index < 16; index++) {
      const path =
        plainDecodePaths[(plainDecodeIndex + index) % plainDecodePaths.length]!
      if (!findRouteMatch(path, decodeProcessed)) {
        throw new Error(`No plain decode match for ${path}`)
      }
    }
    plainDecodeIndex = (plainDecodeIndex + 16) % plainDecodePaths.length
  })

  bench('findRouteMatch decode mixed90 params uncached batch', () => {
    for (let index = 0; index < 16; index++) {
      const path =
        mixedDecodePaths[(mixedDecodeIndex + index) % mixedDecodePaths.length]!
      if (!findRouteMatch(path, decodeProcessed)) {
        throw new Error(`No mixed decode match for ${path}`)
      }
    }
    mixedDecodeIndex = (mixedDecodeIndex + 16) % mixedDecodePaths.length
  })

  bench('findRouteMatch sortable dynamic fanout', () => {
    const result = findRouteMatch(
      '/sort/prefix-63value.suffix-63',
      sortableFanoutProcessed,
    )
    if (result?.route.id !== '/sort/prefix-63{$value}.suffix-63') {
      throw new Error(`Unexpected sortable fanout match ${result?.route.id}`)
    }
  })
})
