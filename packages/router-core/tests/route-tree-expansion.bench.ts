import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  findFlatMatch,
  findRouteMatch,
  processRouteMasks,
  processRouteTree,
} from '../src/new-process-route-tree'
import type { AnyRoute } from '../src'

for (const shape of ['shallow', 'shared', 'competing', 'pathless'] as const) {
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
      const layouts: Array<AnyRoute> = []
      const routes = Array.from({ length: 1000 }, (_, index) => {
        const layout =
          shape === 'pathless'
            ? new BaseRoute({
                getParentRoute: () => root,
                id: `_layout-${index}`,
                params: { parse: (params: Record<string, string>) => params },
              })
            : root
        const route = new BaseRoute({
          getParentRoute: () => layout,
          path: pathFor(index, '$id'),
          ...(shape === 'competing'
            ? { params: { parse: (params: Record<string, string>) => params } }
            : {}),
        })
        if (shape === 'pathless') {
          layouts.push(layout.addChildren([route]))
        }
        return route
      })
      return {
        routes,
        tree: root.addChildren(shape === 'pathless' ? layouts : routes),
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
      ).run({
        time: 0,
        iterations: 64,
        warmupTime: 0,
        warmupIterations: 16,
        throws: true,
      })
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
      ).run({
        time: 0,
        iterations: 64,
        warmupTime: 0,
        warmupIterations: 16,
        throws: true,
      })
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

for (const shape of ['static', 'dynamic', 'nested'] as const) {
  test(`eager mask compilation (${shape}, 1000 masks)`, async ({ bench }) => {
    const processed = processRouteTree<AnyRoute>(
      new BaseRootRoute({}),
    ).processedTree
    const masks = Array.from({ length: 1000 }, (_, index) => {
      return shape === 'static'
        ? { from: `/mask-${index}/details` }
        : shape === 'dynamic'
          ? { from: `/mask-${index}/pre{$id}suffix/{-$lang}` }
          : {
              from: `/mask-${index}/$parent`,
              children: [{ from: `/mask-${index}/$parent/$child` }],
            }
    })
    processRouteMasks(masks, processed)
    for (let index = 0; index < masks.length; index++) {
      const path =
        shape === 'static'
          ? `/mask-${index}/details`
          : shape === 'dynamic'
            ? `/mask-${index}/prevaluesuffix/en`
            : `/mask-${index}/one/two`
      const match = findFlatMatch(path, processed)
      expect(match?.route).toBe(
        shape === 'nested' ? masks[index]!.children![0] : masks[index],
      )
      expect(match?.rawParams).toEqual(
        shape === 'static'
          ? {}
          : shape === 'dynamic'
            ? { id: 'value', lang: 'en' }
            : { parent: 'one', child: 'two' },
      )
    }
    await bench(`eager mask compilation (${shape}, 1000 masks)`, () => {
      processRouteMasks(masks, processed)
    }).run({ time: 500, warmupTime: 200, throws: true })
  })
}
