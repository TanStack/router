import { createRoute } from '@tanstack/vue-router'
import {
  DYNAMIC_ROUTE_COUNT,
  OPTIONAL_ROUTE_COUNT,
  PATHLESS_CHAIN_COUNT,
  SPLAT_ROUTE_COUNT,
  STATIC_ROUTE_COUNT,
  createRouteMarker,
} from '../../shared'
import {
  parseCatalogParams,
  parseCodeParams,
  parseDocsParams,
  parsePriorityFallbackParams,
  parsePriorityValueParams,
  parseSlugParams,
  stringifyCatalogParams,
  stringifyCodeParams,
  stringifyDocsParams,
  stringifyPriorityFallbackParams,
  stringifyPriorityValueParams,
  stringifySlugParams,
} from '../../route-params'
import { createMarkerComponent } from './route-components'
import { Route as rootRoute } from './routes/__root'

const staticRoutes = Array.from({ length: STATIC_ROUTE_COUNT }, (_, index) => {
  const marker = createRouteMarker('static', `static-${index}`)

  return createRoute({
    getParentRoute: () => rootRoute,
    path: `/catalog/products/static-${index}`,
    component: createMarkerComponent(marker.kind, marker.value),
  })
})

const dynamicRoutes = Array.from(
  { length: DYNAMIC_ROUTE_COUNT },
  (_, index) => {
    const marker = createRouteMarker('dynamic', `dynamic-${index}`)

    return createRoute({
      getParentRoute: () => rootRoute,
      path: `/catalog/products/dyn-${index}/$category/$id`,
      params: {
        parse: parseCatalogParams,
        stringify: stringifyCatalogParams,
      },
      component: createMarkerComponent(marker.kind, marker.value),
    })
  },
)

const optionalRoutes = Array.from(
  { length: OPTIONAL_ROUTE_COUNT },
  (_, index) => {
    const marker = createRouteMarker('optional', `optional-${index}`)

    return createRoute({
      getParentRoute: () => rootRoute,
      path: `/docs/topic-${index}/{-$section}/$slug`,
      params: {
        parse: parseDocsParams,
        stringify: stringifyDocsParams,
      },
      component: createMarkerComponent(marker.kind, marker.value),
    })
  },
)

const splatRoutes = Array.from({ length: SPLAT_ROUTE_COUNT }, (_, index) => {
  const marker = createRouteMarker('splat', `splat-${index}`)

  return createRoute({
    getParentRoute: () => rootRoute,
    path: `/files/bucket-${index}/$`,
    component: createMarkerComponent(marker.kind, marker.value),
  })
})

const priorityPrimaryMarker = createRouteMarker('priority-primary', 'primary')
const priorityPrimaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/priority/$value',
  params: {
    parse: parsePriorityValueParams,
    priority: 20,
    stringify: stringifyPriorityValueParams,
  },
  component: createMarkerComponent(
    priorityPrimaryMarker.kind,
    priorityPrimaryMarker.value,
  ),
})

const priorityFallbackMarker = createRouteMarker(
  'priority-fallback',
  'fallback',
)
const priorityFallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/priority/$fallback',
  params: {
    parse: parsePriorityFallbackParams,
    priority: 1,
    stringify: stringifyPriorityFallbackParams,
  },
  component: createMarkerComponent(
    priorityFallbackMarker.kind,
    priorityFallbackMarker.value,
  ),
})

const caseSensitiveMarker = createRouteMarker(
  'case-sensitive',
  'case-sensitive',
)
const caseSensitiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/case/Sensitive/$code',
  caseSensitive: true,
  params: {
    parse: parseCodeParams,
    stringify: stringifyCodeParams,
  },
  component: createMarkerComponent(
    caseSensitiveMarker.kind,
    caseSensitiveMarker.value,
  ),
})

const reservedParamMarker = createRouteMarker(
  'reserved-param',
  'reserved-param',
)
const reservedParamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reserved/$slug',
  params: {
    parse: parseSlugParams,
    stringify: stringifySlugParams,
  },
  component: createMarkerComponent(
    reservedParamMarker.kind,
    reservedParamMarker.value,
  ),
})

function createPathlessChain(index: number) {
  const first = createRoute({
    getParentRoute: () => rootRoute,
    id: `pathless-${index}-0`,
  })
  const second = createRoute({
    getParentRoute: () => first,
    id: `pathless-${index}-1`,
  })
  const third = createRoute({
    getParentRoute: () => second,
    id: `pathless-${index}-2`,
  })
  const fourth = createRoute({
    getParentRoute: () => third,
    id: `pathless-${index}-3`,
  })
  const marker = createRouteMarker('pathless', `pathless-${index}`)
  const leaf = createRoute({
    getParentRoute: () => fourth,
    path: `/pathless/chain-${index}/leaf`,
    component: createMarkerComponent(marker.kind, marker.value),
  })

  return first.addChildren([
    second.addChildren([third.addChildren([fourth.addChildren([leaf])])]),
  ])
}

const pathlessChains = Array.from(
  { length: PATHLESS_CHAIN_COUNT },
  (_, index) => createPathlessChain(index),
)

export const routeTree = rootRoute.addChildren([
  ...staticRoutes,
  ...dynamicRoutes,
  ...optionalRoutes,
  ...splatRoutes,
  priorityPrimaryRoute,
  priorityFallbackRoute,
  caseSensitiveRoute,
  reservedParamRoute,
  ...pathlessChains,
])
