import { expectTypeOf } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
  linkOptions,
} from '@tanstack/octane-router'

const rootRoute = createRootRoute()
const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts/$postId',
  loader: () => ({ title: 'Post' }),
})
const routeTree = rootRoute.addChildren([postRoute])
const _router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})

declare module '@tanstack/octane-router' {
  interface Register {
    router: typeof _router
  }
}

expectTypeOf(postRoute.fullPath).toEqualTypeOf<'/posts/$postId'>()
expectTypeOf(postRoute.useParams()).toEqualTypeOf<{ postId: string }>()
expectTypeOf(postRoute.useLoaderData()).toEqualTypeOf<{ title: string }>()

const postApi = getRouteApi('/posts/$postId')
expectTypeOf(postApi.id).toEqualTypeOf<'/posts/$postId'>()
expectTypeOf(postApi.useParams()).toEqualTypeOf<{ postId: string }>()
expectTypeOf(postApi.useLoaderData()).toEqualTypeOf<{ title: string }>()

const postLink = linkOptions({
  to: '/posts/$postId',
  params: { postId: '42' },
})
expectTypeOf(postLink.to).toEqualTypeOf<'/posts/$postId'>()
expectTypeOf(postLink.params).toEqualTypeOf<{ readonly postId: '42' }>()

// @ts-expect-error unknown route ids stay rejected by the registered route tree
getRouteApi('/missing')
// @ts-expect-error links must target a route from the registered route tree
linkOptions({ to: '/missing' })
