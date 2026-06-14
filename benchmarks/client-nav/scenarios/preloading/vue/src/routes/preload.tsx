import { Link, createRoute } from '@tanstack/vue-router'
import type { createRootRouteForPreloading } from './__root'
import {
  BOOTSTRAP_INTENT_ITEM_ID,
  DEFAULT_ITEM_SEARCH,
  DEFAULT_REPORT_SEARCH,
  INTENT_ITEM_SEARCH,
  VIEWPORT_ITEM_SEARCH,
  normalizePreloadIndexSearch,
} from '../preloading'

type RootRoute = ReturnType<typeof createRootRouteForPreloading>

export function createPreloadIndexRoute(rootRoute: RootRoute) {
  const preloadIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/preload',
    validateSearch: normalizePreloadIndexSearch,
    component: PreloadIndex,
  })

  function PreloadIndex() {
    const search = preloadIndexRoute.useSearch()

    return (
      <section data-preloading-page="index">
        <Link
          data-testid="intent-preload-item"
          to="/preload/items/$itemId"
          params={{ itemId: search.value.intentItemId }}
          search={INTENT_ITEM_SEARCH}
          preload="intent"
          preloadDelay={0}
          replace
        >
          Intent item
        </Link>
        <Link
          data-testid="render-preload-report"
          to="/preload/reports/$reportId"
          params={{ reportId: search.value.renderReportId }}
          search={DEFAULT_REPORT_SEARCH}
          preload="render"
          replace
        >
          Render report
        </Link>
        <Link
          data-testid="viewport-preload-item"
          to="/preload/items/$itemId"
          params={{ itemId: search.value.viewportItemId }}
          search={VIEWPORT_ITEM_SEARCH}
          preload="viewport"
          replace
        >
          Viewport item
        </Link>
        <Link
          data-testid="manual-preload-item"
          to="/preload/items/$itemId"
          params={{ itemId: BOOTSTRAP_INTENT_ITEM_ID }}
          search={DEFAULT_ITEM_SEARCH}
          replace
        >
          Manual item
        </Link>
      </section>
    )
  }

  return preloadIndexRoute
}
