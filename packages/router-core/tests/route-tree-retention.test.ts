import { expect, it } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import type { AnyRoute } from '../src'

async function measureRetainedTree(shape: 'deep' | 'shallow') {
  const root = new BaseRootRoute({})
  const routes = Array.from({ length: 10000 }, (_, index) => {
    return new BaseRoute({
      getParentRoute: () => root,
      path:
        shape === 'deep'
          ? `/section-${index}/$org/items/$id`
          : `/section-${index}/about`,
    })
  })
  root.addChildren(routes)
  const heap = async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    globalThis.gc!()
    return process.memoryUsage().heapUsed
  }
  const pathFor = (index: number) =>
    shape === 'deep'
      ? `/section-${index}/one/items/two`
      : `/section-${index}/about`
  const objects = await heap()
  const result = processRouteTree<AnyRoute>(root)
  const registered = await heap()
  for (let index = 0; index < 10; index++) {
    expect(findRouteMatch(pathFor(index), result.processedTree)?.route).toBe(
      routes[index],
    )
  }
  const session = await heap()
  for (let index = 0; index < routes.length; index++) {
    findRouteMatch(pathFor(index), result.processedTree)
  }
  const complete = await heap()
  // Keep the tree and both lookup maps live across every collection.
  expect(Object.keys(result.routesById)).toHaveLength(10001)
  expect(findRouteMatch(pathFor(9999), result.processedTree)?.route).toBe(
    routes[9999],
  )
  return {
    registered: registered - objects,
    session: session - objects,
    complete: complete - objects,
  }
}

// A diagnostic retained-JS-heap workload, separate from native allocation
// benchmarks. Run in an isolated fork with --execArgv=--expose-gc.
for (const shape of ['deep', 'shallow'] as const) {
  it.skipIf(process.env.RUN_ROUTE_TREE_RETENTION !== '1' || !globalThis.gc)(
    `retains ${shape} route matching data for a small session and a complete traversal`,
    async () => {
      const samples = []
      for (let sample = 0; sample < 5; sample++) {
        samples.push(await measureRetainedTree(shape))
      }
      console.log(
        'route-tree retained heap bytes',
        shape,
        JSON.stringify(samples),
      )
    },
  )
}
