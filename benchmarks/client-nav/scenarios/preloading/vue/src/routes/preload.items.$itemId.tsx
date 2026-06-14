import type { VNodeChild } from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import type { createRootRouteForPreloading } from './__root'
import {
  normalizeItemSearch,
  preloadComponent,
  recordDetailLoader,
  recordItemBeforeLoad,
  recordItemLoader,
  runPreloadingComputation,
  staleWindowMs,
} from '../preloading'

type RootRoute = ReturnType<typeof createRootRouteForPreloading>

type PreloadableComponent = (() => VNodeChild) & {
  preload?: () => Promise<void>
}

export function createItemRoutes(rootRoute: RootRoute) {
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload/items/$itemId',
    validateSearch: normalizeItemSearch,
    beforeLoad: ({ params }) => ({
      itemSeed: recordItemBeforeLoad(params.itemId),
    }),
    loaderDeps: ({ search }) => ({ view: search.view }),
    loader: ({ params, deps, context }) => ({
      checksum: recordItemLoader(params.itemId, deps),
      contextChecksum: runPreloadingComputation(context.itemSeed, 12),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: staleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: staleWindowMs,
    component: ItemPage,
  })

  const itemDetailsRoute = createRoute({
    getParentRoute: () => itemRoute,
    path: 'details',
    loaderDeps: ({ search }) => ({ view: search.view }),
    loader: ({ params, deps }) => ({
      checksum: recordDetailLoader(params.itemId, deps),
    }),
    staleTime: staleWindowMs,
    preloadStaleTime: staleWindowMs,
    gcTime: staleWindowMs,
    preloadGcTime: staleWindowMs,
    component: DetailsPage,
  })

  function ItemPage() {
    const params = itemRoute.useParams()

    return (
      <article data-preloading-page="item" data-item-id={params.value.itemId}>
        <Outlet />
      </article>
    )
  }

  function DetailsPage() {
    const params = itemDetailsRoute.useParams()

    return (
      <article
        data-preloading-page="details"
        data-item-id={params.value.itemId}
      >
        Details
      </article>
    )
  }

  ;(ItemPage as PreloadableComponent).preload = () => preloadComponent('item')
  ;(DetailsPage as PreloadableComponent).preload = () =>
    preloadComponent('details')

  return { itemRoute, itemDetailsRoute }
}
