import type { AnyRoute } from '@tanstack/router-core'
import type {
  PrerenderParamsEntry,
  PrerenderParamsResult,
  RoutePrerenderOptions,
  RouteSitemapOptions,
} from '@tanstack/start-client-core'

export interface PrerenderRouteMetadata {
  path: string
  routePath: string
}

export interface PrerenderRouteOptions {
  prerenderParams?: (ctx: {
    routePath: string
    signal: AbortSignal
  }) =>
    | PrerenderParamsResult<PrerenderParamsEntry<Record<string, unknown>>>
    | Promise<
        PrerenderParamsResult<PrerenderParamsEntry<Record<string, unknown>>>
      >
  prerender?: RoutePrerenderOptions
  sitemap?: RouteSitemapOptions
}

export function collectPrerenderRouteOptions(routeTree: AnyRoute | undefined): {
  routeOptions: Map<string, PrerenderRouteOptions>
  dynamicRoutes: Array<PrerenderRouteMetadata>
  sitemapRoutes: Array<PrerenderRouteMetadata>
} {
  const routeOptions = new Map<string, PrerenderRouteOptions>()
  const dynamicRoutes: Array<PrerenderRouteMetadata> = []
  const sitemapRoutes: Array<PrerenderRouteMetadata> = []

  if (!routeTree) {
    return { routeOptions, dynamicRoutes, sitemapRoutes }
  }

  visit(routeTree)

  return { routeOptions, dynamicRoutes, sitemapRoutes }

  function visit(route: AnyRoute) {
    const options = route.options as PrerenderRouteOptions & {
      id?: string
      path?: string
    }
    const routePath = route.id ?? options.id ?? options.path
    const path = route.fullPath ?? options.path ?? routePath

    if (routePath && path) {
      const metadata = {
        path,
        routePath,
      }

      if (options.prerenderParams) {
        dynamicRoutes.push(metadata)
      }

      if (options.sitemap) {
        sitemapRoutes.push(metadata)
      }

      if (options.prerenderParams || options.sitemap) {
        routeOptions.set(routePath, {
          prerenderParams: options.prerenderParams,
          prerender: options.prerender,
          sitemap: options.sitemap,
        })
      }
    }

    const children = route.children
    if (!children) {
      return
    }

    for (const child of Array.isArray(children)
      ? children
      : Object.values(children)) {
      visit(child as AnyRoute)
    }
  }
}
