import { expectTypeOf, test } from 'vitest'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '../src'

const rootRoute = createRootRouteWithContext<{ auth: string }>()()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})
const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$postId',
  validateSearch: () => ({ page: 0 }),
})

const _router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, postRoute]),
  history: createMemoryHistory({ initialEntries: ['/'] }),
  context: { auth: 'token' },
})

test('router exposes typed navigate/buildLocation methods', () => {
  expectTypeOf(_router.navigate).toBeFunction()

  const loc = _router.buildLocation({
    to: '/posts/$postId',
    params: { postId: '1' },
    search: { page: 2 },
  })

  expectTypeOf(loc.pathname).toEqualTypeOf<string>()
  expectTypeOf(loc.href).toEqualTypeOf<string>()
})
