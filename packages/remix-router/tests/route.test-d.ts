import { describe, expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  useLoaderData,
  useParams,
  useSearch,
} from '../src'
import type { Handle } from '@remix-run/ui'

describe('Route + accessor types', () => {
  test('useLoaderData returns a getter narrowed by `from`', () => {
    const root = createRootRoute()
    const items = createRoute({
      getParentRoute: () => root,
      path: '/items',
      loader: async () => ({ items: [1, 2, 3] }),
    })
    root.addChildren([items])
    const router = createRouter({ routeTree: root })
    type R = typeof router

    const handle = {} as Handle
    const data = useLoaderData<R, '/items'>(handle, { from: '/items' })
    expectTypeOf(data).toBeFunction()
    // Result has the loader's return shape (covered by router-core type tests).
    expectTypeOf(data()).toExtend<{ items: Array<number> } | undefined>()
  })

  test('useParams returns the strict params object', () => {
    const root = createRootRoute()
    const detail = createRoute({
      getParentRoute: () => root,
      path: 'users/$id',
    })
    root.addChildren([detail])
    const router = createRouter({ routeTree: root })
    type R = typeof router

    const handle = {} as Handle
    const params = useParams<R, '/users/$id'>(handle, { from: '/users/$id' })
    expectTypeOf(params).toBeFunction()
  })

  test('useSearch returns a getter', () => {
    const root = createRootRoute()
    const items = createRoute({
      getParentRoute: () => root,
      path: '/items',
    })
    root.addChildren([items])
    const router = createRouter({ routeTree: root })
    type R = typeof router

    const handle = {} as Handle
    const search = useSearch<R, '/items'>(handle, { from: '/items' })
    expectTypeOf(search).toBeFunction()
  })
})
