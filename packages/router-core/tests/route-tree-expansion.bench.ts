import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import type { AnyRoute } from '../src'

for (const shape of ['shallow', 'shared', 'competing'] as const) {
  describe(`route-tree expansion (${shape}, 1000 routes)`, () => {
    const pathFor = (index: number, value = 'one') => {
      return shape === 'shallow'
        ? `/route-${index}`
        : shape === 'shared'
          ? `/shared/route-${index}/${value}/details`
          : `/${value}/route-${index}/details`
    }
    const create = () => {
      const root = new BaseRootRoute({})
      const routes = Array.from({ length: 1000 }, (_, index) => {
        return new BaseRoute({
          getParentRoute: () => root,
          path: pathFor(index, '$id'),
          ...(shape === 'competing'
            ? { params: { parse: (params: Record<string, string>) => params } }
            : {}),
        })
      })
      return {
        routes,
        tree: root.addChildren(routes),
      }
    }
    const register = () => {
      return processRouteTree<AnyRoute>(create().tree).processedTree
    }
    const fixture = create()
    const verified = processRouteTree<AnyRoute>(fixture.tree).processedTree
    for (let index = 0; index < fixture.routes.length; index++) {
      expect(findRouteMatch(pathFor(index), verified)?.route).toBe(
        fixture.routes[index],
      )
    }
    expect(findRouteMatch('/unknown/never', verified)).toBeNull()

    test('cold first match after registration', async ({ bench }) => {
      let processed = register()
      await bench(
        'cold first match after registration',
        {
          beforeEach: () => {
            processed = register()
          },
        },
        () => {
          findRouteMatch(pathFor(0), processed)
        },
      ).run({ time: 500, warmupTime: 200, throws: true })
    })

    test('cold miss after registration', async ({ bench }) => {
      let processed = register()
      await bench(
        'cold miss after registration',
        {
          beforeEach: () => {
            processed = register()
          },
        },
        () => {
          findRouteMatch('/unknown/never', processed)
        },
      ).run({ time: 500, warmupTime: 200, throws: true })
    })

    test('warm matching with uncached params or fuzzy suffixes', async ({
      bench,
    }) => {
      let value = 0
      await bench(
        'warm matching with uncached params or fuzzy suffixes',
        () => {
          // Batch fast matches so the clock does not dominate shallow routes.
          for (let iteration = 0; iteration < 16; iteration++) {
            const path =
              shape === 'shallow'
                ? `/route-0/extra-${value++}`
                : pathFor(0, `value-${value++}`)
            findRouteMatch(path, verified, true)
          }
        },
      ).run({ time: 500, warmupTime: 200, throws: true })
    })

    test('construction and complete traversal', async ({ bench }) => {
      let tree = create().tree
      await bench(
        'construction and complete traversal',
        {
          beforeEach: () => {
            tree = create().tree
          },
        },
        () => {
          const processed = processRouteTree<AnyRoute>(tree).processedTree
          for (let index = 0; index < 1000; index++) {
            findRouteMatch(pathFor(index), processed)
          }
        },
      ).run({ time: 500, warmupTime: 200, throws: true })
    })
  })
}
