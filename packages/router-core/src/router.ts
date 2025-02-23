import type { ParsedLocation } from './location'
import type { DeferredPromiseState } from './defer'
import type { ControlledPromise } from './utils'
import type { AnyRoute, AnyRouteWithContext } from './route'

export interface Register {
  // router: Router
}

export type RegisteredRouter = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : AnyRouter

export interface RouterOptions<
  in out TTrailingSlashOption extends TrailingSlashOption,
> {
  trailingSlash?: TTrailingSlashOption
}

export interface Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
> {
  routeTree: TRouteTree
  options: RouterOptions<TTrailingSlashOption>
}

export type AnyRouterWithContext<TContext> = Router<
  AnyRouteWithContext<TContext>,
  any
>

export type AnyRouter = Router<any, any>

export interface ViewTransitionOptions {
  types: Array<string>
}

export function defaultSerializeError(err: unknown) {
  if (err instanceof Error) {
    const obj = {
      name: err.name,
      message: err.message,
    }

    if (process.env.NODE_ENV === 'development') {
      ;(obj as any).stack = err.stack
    }

    return obj
  }

  return {
    data: err,
  }
}
export interface ExtractedBaseEntry {
  dataType: '__beforeLoadContext' | 'loaderData'
  type: string
  path: Array<string>
  id: number
  matchIndex: number
}

export interface ExtractedStream extends ExtractedBaseEntry {
  type: 'stream'
  streamState: StreamState
}

export interface ExtractedPromise extends ExtractedBaseEntry {
  type: 'promise'
  promiseState: DeferredPromiseState<any>
}

export type ExtractedEntry = ExtractedStream | ExtractedPromise

export type StreamState = {
  promises: Array<ControlledPromise<string | null>>
}

export type TrailingSlashOption = 'always' | 'never' | 'preserve'

export function getLocationChangeInfo(routerState: {
  resolvedLocation?: ParsedLocation
  location: ParsedLocation
}) {
  const fromLocation = routerState.resolvedLocation
  const toLocation = routerState.location
  const pathChanged = fromLocation?.pathname !== toLocation.pathname
  const hrefChanged = fromLocation?.href !== toLocation.href
  const hashChanged = fromLocation?.hash !== toLocation.hash
  return { fromLocation, toLocation, pathChanged, hrefChanged, hashChanged }
}
