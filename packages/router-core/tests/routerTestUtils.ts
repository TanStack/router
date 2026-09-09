import { batch, createAtom } from '@tanstack/store'
import { createMemoryHistory } from '@tanstack/history'
import { isServer } from '@tanstack/router-core/isServer'
import {
  RouterCore,
  BaseRootRoute,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { cleanPath, hasMissingPathParams, interpolatePath } from '../src/path'
import {
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
  parseSegments,
  processRouteTree,
} from '../src/new-process-route-tree'
import type { SegmentKind } from '../src/new-process-route-tree'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRouter,
  AnyRoute,
  GetStoreConfig,
  RouterConstructorOptions,
  RouterOptions,
  TrailingSlashOption,
} from '../src'

const getStoreConfig: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
  }
}

export function createTestRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) {
  return new RouterCore(options, getStoreConfig)
}

type RouteTreeInput = Parameters<typeof processRouteTree>[0]
type FixtureNode = {
  init?: RouteTreeInput['init']
  children?: ReadonlyArray<FixtureNode>
}

const fixtureInit = () => {}

function prepareFixture<T extends FixtureNode>(
  route: T,
): asserts route is T & Pick<RouteTreeInput, 'init'> {
  if (!route.init) {
    // Raw matcher fixtures already specify their derived paths and IDs.
    Object.defineProperty(route, 'init', { value: fixtureInit })
  }
  for (const child of route.children ?? []) {
    prepareFixture(child)
  }
}

export function processTestRouteTree<
  TRoute extends Omit<RouteTreeInput, 'init'>,
>(routeTree: TRoute, caseSensitive = false) {
  prepareFixture(routeTree)
  return processRouteTree(routeTree, caseSensitive)
}

export type PathInterpolationTestOptions = {
  path: string
  params: Record<string, unknown>
  decoder?: Parameters<typeof interpolatePath>[3]
  server?: boolean
}

export function createTestPathInterpolator(
  options: Pick<
    RouterOptions<AnyRoute, 'never'>,
    'isServer' | 'pathParamsAllowedCharacters'
  > = {},
) {
  const router = createTestRouter({
    routeTree: new BaseRootRoute({}),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    scrollRestoration: false,
    ...options,
  })
  router.history.destroy()
  return (
    options: Pick<PathInterpolationTestOptions, 'path' | 'params'>,
  ): string => {
    return router['interpolatePath'](options.path, options.params)
  }
}

export function interpolateTestPath(
  path: string,
  params: Record<string, unknown>,
  decoder?: (encoded: string) => string,
  usedParams?: Record<string, unknown>,
  keys?: Array<string>,
  metadata?: { isMissingParams: boolean },
) {
  const segments = parseSegments(false, { fullPath: cleanPath(path) }, 0)
  if (keys) {
    for (const segment of segments) {
      if (typeof segment !== 'string') {
        keys.push(segment[1 /* key */])
      }
    }
  }
  const pathname = interpolatePath(path, segments, params, decoder, usedParams)
  if (metadata && hasMissingPathParams(segments, params)) {
    metadata.isMissingParams = true
  }
  return pathname
}

export function parseTestPathname(to: string | undefined) {
  const path = to ?? ''
  const segments: Array<{
    type: SegmentKind
    value: string
    prefixSegment?: string
    suffixSegment?: string
  }> = []
  let cursor = 0
  while (cursor < path.length) {
    const start = cursor
    const next = path.indexOf('/', start)
    const end = next === -1 ? path.length : next
    const data = parseSegment(path, start, end)
    cursor = end + 1
    if (typeof data === 'string') {
      segments.push({ type: SEGMENT_TYPE_PATHNAME, value: data })
    } else {
      const [type, key, prefix, suffix] = data
      const splat = type === SEGMENT_TYPE_WILDCARD
      if (splat) {
        cursor = path.length + 1
      }
      const segment: (typeof segments)[number] = {
        type,
        value: splat
          ? suffix === undefined
            ? path.substring(start)
            : '$'
          : key,
      }
      if (prefix) {
        segment.prefixSegment = prefix
      }
      if (suffix) {
        segment.suffixSegment = suffix
      }
      segments.push(segment)
    }
  }
  return segments
}

/** Materialize the request-local server result as the HTTP response users see. */
export function loadServerResponse(
  router: AnyRouter,
  path: string,
  signal?: AbortSignal,
) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`, { signal }),
  })(({ router: loadedRouter, responseHeaders }) => {
    const result = loadedRouter._serverResult
    return new Response(null, {
      status:
        result?.type === 'redirect'
          ? result.redirect.status
          : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}
