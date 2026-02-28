import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$postId',
})

const _router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
})

test('redirect options stay aligned with router route ids/paths', () => {
  const redir = redirect<typeof _router>({
    to: '/posts/$postId',
    params: { postId: '123' },
  })

  expectTypeOf(redir).toBeObject()
})
