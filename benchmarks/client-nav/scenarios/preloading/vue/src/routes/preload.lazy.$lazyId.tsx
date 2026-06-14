import type { VNodeChild } from 'vue'
import { createLazyRoute, createRoute } from '@tanstack/vue-router'
import type { createRootRouteForPreloading } from './__root'
import {
  preloadComponent,
  recordLazyLoader,
  recordLazyRouteResolution,
  staleWindowMs,
} from '../preloading'

type RootRoute = ReturnType<typeof createRootRouteForPreloading>

type PreloadableComponent = (() => VNodeChild) & {
  preload?: () => Promise<void>
}

export function createLazyPreloadRoute(rootRoute: RootRoute) {
  const lazyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/lazy/$lazyId',
    loader: ({ params }) => ({
      checksum: recordLazyLoader(params.lazyId),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: staleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: staleWindowMs,
  }).lazy(async () => {
    recordLazyRouteResolution()
    return createLazyRoute('/preload/lazy/$lazyId')({
      component: LazyPage,
    })
  })

  function LazyPage() {
    const params = lazyRoute.useParams()

    return (
      <article data-preloading-page="lazy" data-lazy-id={params.value.lazyId}>
        Lazy
      </article>
    )
  }

  ;(LazyPage as PreloadableComponent).preload = () => preloadComponent('lazy')

  return lazyRoute
}
