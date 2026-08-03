import type {
  AnyContext,
  AnyRoute,
  Awaitable,
  Expand,
  ResolveAllParamsFromParent,
  ResolveFullSearchSchemaInput,
} from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  /* eslint-disable unused-imports/no-unused-vars */
  interface FilebaseRouteOptionsInterface<
    TRegister,
    TParentRoute extends AnyRoute = AnyRoute,
    TId extends string = string,
    TPath extends string = string,
    TSearchValidator = undefined,
    TParams = {},
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TRouterContext = {},
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TRemountDepsFn = AnyContext,
    TSSR = unknown,
    TServerMiddlewares = unknown,
    THandlers = undefined,
  > {
    prerenderParams?: (
      ctx: PrerenderParamsContext<TPath>,
    ) => Awaitable<
      PrerenderParamsResult<
        PrerenderParamsEntry<
          Expand<ResolveAllParamsFromParent<TParentRoute, TParams>>,
          Expand<ResolveFullSearchSchemaInput<TParentRoute, TSearchValidator>>
        >
      >
    >
    sitemap?: RouteSitemapOptions
  }
  /* eslint-enable unused-imports/no-unused-vars */
}

export interface PrerenderParamsContext<TPath extends string = string> {
  routePath: TPath
  signal: AbortSignal
}

export type PrerenderParamsResult<TEntry> =
  | ReadonlyArray<TEntry>
  | Iterable<TEntry>
  | AsyncIterable<TEntry>

type PrerenderParamsSearch<TSearch> = unknown extends TSearch
  ? { search?: Record<string, unknown> }
  : {} extends TSearch
    ? { search?: Expand<TSearch> }
    : { search: Expand<TSearch> }

export type PrerenderParamsEntry<TParams, TSearch = {}> = {
  params: TParams
  sitemap?: RouteSitemapOptions
  prerender?: RoutePrerenderOptions
} & PrerenderParamsSearch<TSearch>

export interface RouteSitemapOptions {
  exclude?: boolean
  priority?: number
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
  lastmod?: string | Date
  alternateRefs?: Array<{
    href: string
    hreflang: string
  }>
  images?: Array<{
    loc: string
    caption?: string
    title?: string
  }>
  news?: {
    publication: {
      name: string
      language: string
    }
    publicationDate: string | Date
    title: string
  }
}

export interface RoutePrerenderOptions {
  enabled?: boolean
  outputPath?: string
  autoSubfolderIndex?: boolean
  crawlLinks?: boolean
  retryCount?: number
  retryDelay?: number
  onSuccess?: (opts: {
    page: {
      path: string
      sitemap?: RouteSitemapOptions
      fromCrawl?: boolean
    }
    html: string
  }) => any
  headers?: Record<string, string>
}
