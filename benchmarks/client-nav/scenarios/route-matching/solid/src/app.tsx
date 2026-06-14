import { render } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'
import {
  DYNAMIC_ROUTE_COUNT,
  INITIAL_ROUTE_PATH,
  OPTIONAL_ROUTE_COUNT,
  PATHLESS_CHAIN_COUNT,
  SPLAT_ROUTE_COUNT,
  STATIC_ROUTE_COUNT,
  createRouteMarker,
  normalizeNumericId,
  normalizeSlug,
  type RouteKind,
} from '../../shared'

type MarkerProps = {
  kind: RouteKind
  marker: string
}

type CatalogParams = {
  category: string
  id: number
}

type DocsParams = {
  section?: string
  slug: string
}

type SlugParams = {
  slug: string
}

type CodeParams = {
  code: string
}

type PriorityValueParams = {
  value: string
}

type PriorityFallbackParams = {
  fallback: string
}

function RouteMarker(props: MarkerProps) {
  return <main data-bench-route={props.kind} data-bench-marker={props.marker} />
}

function createMarkerComponent(kind: RouteKind, marker: string) {
  return function BenchRouteMarker() {
    return <RouteMarker kind={kind} marker={marker} />
  }
}

function RootComponent() {
  return <Outlet />
}

function RootNotFoundComponent() {
  const marker = createRouteMarker('not-found', 'not-found')
  return <RouteMarker kind={marker.kind} marker={marker.value} />
}

function parseCatalogParams(params: { category: string; id: string }) {
  return {
    category: normalizeSlug(params.category),
    id: normalizeNumericId(params.id),
  }
}

function stringifyCatalogParams(params: CatalogParams) {
  return {
    category: normalizeSlug(params.category),
    id: `${params.id}`,
  }
}

function parseDocsParams(params: { section?: string; slug: string }) {
  return {
    section:
      params.section === undefined ? undefined : normalizeSlug(params.section),
    slug: normalizeSlug(params.slug),
  }
}

function stringifyDocsParams(params: DocsParams) {
  return {
    section:
      params.section === undefined ? undefined : normalizeSlug(params.section),
    slug: normalizeSlug(params.slug),
  }
}

function parseSlugParams(params: { slug: string }) {
  return {
    slug: normalizeSlug(params.slug),
  }
}

function stringifySlugParams(params: SlugParams) {
  return {
    slug: normalizeSlug(params.slug),
  }
}

function parseCodeParams(params: { code: string }) {
  return {
    code: normalizeSlug(params.code),
  }
}

function stringifyCodeParams(params: CodeParams) {
  return {
    code: normalizeSlug(params.code),
  }
}

function parsePriorityValueParams(params: { value: string }) {
  const value = normalizeSlug(params.value)

  if (!value.startsWith('fast-')) {
    return false
  }

  return {
    value,
  }
}

function stringifyPriorityValueParams(params: PriorityValueParams) {
  return {
    value: normalizeSlug(params.value),
  }
}

function parsePriorityFallbackParams(params: { fallback: string }) {
  return {
    fallback: normalizeSlug(params.fallback),
  }
}

function stringifyPriorityFallbackParams(params: PriorityFallbackParams) {
  return {
    fallback: normalizeSlug(params.fallback),
  }
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: RootNotFoundComponent,
})

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

const routeTree = rootRoute.addChildren([
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

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [INITIAL_ROUTE_PATH],
    }),
    pathParamsAllowedCharacters: ['@', ':'],
    routeTree,
  })
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
