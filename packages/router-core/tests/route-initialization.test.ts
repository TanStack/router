import { expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { processRouteTree } from '../src/new-process-route-tree'
import type { AnyRoute } from '../src'

test('normalizes nested route IDs without changing pathless layout paths', () => {
  const root = new BaseRootRoute({})
  const layout = new BaseRoute({
    getParentRoute: () => root,
    id: '//_layout//',
  })
  const item = new BaseRoute({
    getParentRoute: () => layout,
    path: '//items//$id//',
  })
  const { routesById } = processRouteTree<AnyRoute>(
    root.addChildren([layout.addChildren([item])]),
    false,
    (route, originalIndex) => route.init({ originalIndex }),
  )
  expect(root.id).toBe('__root__')
  expect(layout.id).toBe('/_layout/')
  expect(layout.fullPath).toBe('/')
  expect(item.id).toBe('/_layout/items/$id/')
  expect(item.fullPath).toBe('/items/$id/')
  expect(item.to).toBe('/items/$id')
  expect(routesById[item.id]).toBe(item)
})
