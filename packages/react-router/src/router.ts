import { RouterHistory } from '@tanstack/history'

//

import {
  AnySearchSchema,
  AnyRoute,
  AnyContext,
  AnyPathParams,
  RouteMask,
} from './route'
import { FullSearchSchema } from './routeInfo'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import { PickAsRequired, Updater, NonNullableUpdater } from './utils'
import {
  ErrorRouteComponent,
  PendingRouteComponent,
  RouteComponent,
} from './react'
import { RouteMatch } from './RouteMatch'
import { ParsedLocation } from './location'
import { LocationState } from './location'
import { SearchSerializer, SearchParser } from './searchParams'

//

declare global {
  interface Window {
    __TSR_DEHYDRATED__?: HydrationCtx
  }
}

export interface Register {
  // router: Router
}

export type AnyRouter = Router<any, any>

export type RegisteredRouter = Register extends {
  router: infer TRouter extends AnyRouter
}
  ? TRouter
  : AnyRouter

export type HydrationCtx = {
  router: DehydratedRouter
  payload: Record<string, any>
}

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends TRouteTree['types']['routerMeta']
    ? {
        meta?: TRouteTree['types']['routerMeta']
      }
    : {
        meta: TRouteTree['types']['routerMeta']
      }

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  history?: RouterHistory
  stringifySearch?: SearchSerializer
  parseSearch?: SearchParser
  defaultPreload?: false | 'intent'
  defaultPreloadDelay?: number
  defaultComponent?: RouteComponent<AnySearchSchema, AnyPathParams, AnyContext>
  defaultErrorComponent?: ErrorRouteComponent<
    AnySearchSchema,
    AnyPathParams,
    AnyContext
  >
  defaultPendingComponent?: PendingRouteComponent<
    AnySearchSchema,
    AnyPathParams,
    AnyContext
  >
  defaultMaxAge?: number
  defaultGcMaxAge?: number
  defaultPreloadMaxAge?: number
  caseSensitive?: boolean
  routeTree?: TRouteTree
  basepath?: string
  createRoute?: (opts: { route: AnyRoute; router: AnyRouter }) => void
  meta?: TRouteTree['types']['routerMeta']
  // dehydrate?: () => TDehydrated
  // hydrate?: (dehydrated: TDehydrated) => void
  routeMasks?: RouteMask<TRouteTree>[]
  unmaskOnReload?: boolean
}

export interface RouterState<TRouteTree extends AnyRoute = AnyRoute> {
  status: 'idle' | 'pending'
  isFetching: boolean
  matches: RouteMatch<TRouteTree>[]
  pendingMatches: RouteMatch<TRouteTree>[]
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation: ParsedLocation<FullSearchSchema<TRouteTree>>
  lastUpdated: number
}

export type ListenerFn<TEvent extends RouterEvent> = (event: TEvent) => void

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<LocationState>
  mask?: {
    to?: string | number | null
    params?: true | Updater<unknown>
    search?: true | Updater<unknown>
    hash?: true | Updater<string>
    state?: true | NonNullableUpdater<LocationState>
    unmaskOnReload?: boolean
  }
  from?: string
}

export interface DehydratedRouterState {
  dehydratedMatches: DehydratedRouteMatch[]
}

export type DehydratedRouteMatch = Pick<
  RouteMatch,
  'fetchedAt' | 'invalid' | 'id' | 'status' | 'updatedAt'
>

export interface DehydratedRouter {
  state: DehydratedRouterState
}

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TDehydrated extends Record<string, any>,
> = Omit<RouterOptions<TRouteTree, TDehydrated>, 'context'> &
  RouterContextOptions<TRouteTree>

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export type RouterEvents = {
  onBeforeLoad: {
    type: 'onBeforeLoad'
    from: ParsedLocation
    to: ParsedLocation
    pathChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    from: ParsedLocation
    to: ParsedLocation
    pathChanged: boolean
  }
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

export class Router<
  TRouteTree extends AnyRoute = AnyRoute,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  options: PickAsRequired<
    RouterOptions<TRouteTree, TDehydrated>,
    'stringifySearch' | 'parseSearch' | 'meta'
  >
  routeTree: TRouteTree
  // dehydratedData?: TDehydrated
  // resetNextScroll = false
  // tempLocationKey = `${Math.round(Math.random() * 10000000)}`

  constructor(options: RouterConstructorOptions<TRouteTree, TDehydrated>) {
    this.options = {
      defaultPreloadDelay: 50,
      meta: undefined!,
      ...options,
      stringifySearch: options?.stringifySearch ?? defaultStringifySearch,
      parseSearch: options?.parseSearch ?? defaultParseSearch,
    }

    this.routeTree = this.options.routeTree as TRouteTree
  }

  subscribers = new Set<RouterListener<RouterEvent>>()

  subscribe = <TType extends keyof RouterEvents>(
    eventType: TType,
    fn: ListenerFn<RouterEvents[TType]>,
  ) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit = (routerEvent: RouterEvent) => {
    this.subscribers.forEach((listener) => {
      if (listener.eventType === routerEvent.type) {
        listener.fn(routerEvent)
      }
    })
  }

  // dehydrate = (): DehydratedRouter => {
  //   return {
  //     state: {
  //       dehydratedMatches: state.matches.map((d) =>
  //         pick(d, ['fetchedAt', 'invalid', 'id', 'status', 'updatedAt']),
  //       ),
  //     },
  //   }
  // }

  // hydrate = async (__do_not_use_server_ctx?: HydrationCtx) => {
  //   let _ctx = __do_not_use_server_ctx
  //   // Client hydrates from window
  //   if (typeof document !== 'undefined') {
  //     _ctx = window.__TSR_DEHYDRATED__
  //   }

  //   invariant(
  //     _ctx,
  //     'Expected to find a __TSR_DEHYDRATED__ property on window... but we did not. Did you forget to render <DehydrateRouter /> in your app?',
  //   )

  //   const ctx = _ctx
  //   this.dehydratedData = ctx.payload as any
  //   this.options.hydrate?.(ctx.payload as any)
  //   const dehydratedState = ctx.router.state

  //   let matches = this.matchRoutes(
  //     state.location.pathname,
  //     state.location.search,
  //   ).map((match) => {
  //     const dehydratedMatch = dehydratedState.dehydratedMatches.find(
  //       (d) => d.id === match.id,
  //     )

  //     invariant(
  //       dehydratedMatch,
  //       `Could not find a client-side match for dehydrated match with id: ${match.id}!`,
  //     )

  //     if (dehydratedMatch) {
  //       return {
  //         ...match,
  //         ...dehydratedMatch,
  //       }
  //     }
  //     return match
  //   })

  //   this.setState((s) => {
  //     return {
  //       ...s,
  //       matches: dehydratedState.dehydratedMatches as any,
  //     }
  //   })
  // }

  // TODO:
  // injectedHtml: (string | (() => Promise<string> | string))[] = []

  // TODO:
  // injectHtml = async (html: string | (() => Promise<string> | string)) => {
  //   this.injectedHtml.push(html)
  // }

  // TODO:
  // dehydrateData = <T>(key: any, getData: T | (() => Promise<T> | T)) => {
  //   if (typeof document === 'undefined') {
  //     const strKey = typeof key === 'string' ? key : JSON.stringify(key)

  //     this.injectHtml(async () => {
  //       const id = `__TSR_DEHYDRATED__${strKey}`
  //       const data =
  //         typeof getData === 'function' ? await (getData as any)() : getData
  //       return `<script id='${id}' suppressHydrationWarning>window["__TSR_DEHYDRATED__${escapeJSON(
  //         strKey,
  //       )}"] = ${JSON.stringify(data)}
  //       ;(() => {
  //         var el = document.getElementById('${id}')
  //         el.parentElement.removeChild(el)
  //       })()
  //       </script>`
  //     })

  //     return () => this.hydrateData<T>(key)
  //   }

  //   return () => undefined
  // }

  // hydrateData = <T = unknown>(key: any) => {
  //   if (typeof document !== 'undefined') {
  //     const strKey = typeof key === 'string' ? key : JSON.stringify(key)

  //     return window[`__TSR_DEHYDRATED__${strKey}` as any] as T
  //   }

  //   return undefined
  // }

  // resolveMatchPromise = (matchId: string, key: string, value: any) => {
  //   state.matches
  //     .find((d) => d.id === matchId)
  //     ?.__promisesByKey[key]?.resolve(value)
  // }

  // setRouteMatch = (
  //   id: string,
  //   pending: boolean,
  //   updater: NonNullableUpdater<RouteMatch<TRouteTree>>,
  // ) => {
  //   const key = pending ? 'pendingMatches' : 'matches'

  //   this.setState((prev) => {
  //     return {
  //       ...prev,
  //       [key]: prev[key].map((d) => {
  //         if (d.id === id) {
  //           return functionalUpdate(updater, d)
  //         }

  //         return d
  //       }),
  //     }
  //   })
  // }

  // setPendingRouteMatch = (
  //   id: string,
  //   updater: NonNullableUpdater<RouteMatch<TRouteTree>>,
  // ) => {
  //   this.setRouteMatch(id, true, updater)
  // }
}

function escapeJSON(jsonString: string) {
  return jsonString
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
}

// A function that takes an import() argument which is a function and returns a new function that will
// proxy arguments from the caller to the imported function, retaining all type
// information along the way
export function lazyFn<
  T extends Record<string, (...args: any[]) => any>,
  TKey extends keyof T = 'default',
>(fn: () => Promise<T>, key?: TKey) {
  return async (...args: Parameters<T[TKey]>): Promise<ReturnType<T[TKey]>> => {
    const imported = await fn()
    return imported[key || 'default'](...args)
  }
}
