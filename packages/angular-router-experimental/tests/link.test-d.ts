import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { LinkInputOptions } from '../src'

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$postId',
  validateSearch: () => ({ page: 0 }),
})

const _router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
})

test('LinkInputOptions accepts route/search/params object model', () => {
  const options: LinkInputOptions<typeof _router, '/posts/$postId'> = {
    to: '.',
    params: { postId: '1' },
    search: { page: 1 },
  }

  expectTypeOf(options.to).toMatchTypeOf<string | undefined>()
  expectTypeOf(options.params).toMatchTypeOf<unknown>()
  expectTypeOf(options.search).toMatchTypeOf<unknown>()
})
