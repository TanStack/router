import { isPlainObject } from '@tanstack/router-core'

import invariant from 'tiny-invariant'

import { startSerializer } from './serializer'
import type {
  AnyRouter,
  ControllablePromise,
  DeferredPromiseState,
  MakeRouteMatch,
  Manifest,
  RouteContextOptions,
} from '@tanstack/router-core'

declare global {
  interface Window {
    __TSR_SSR__?: StartSsrGlobal
  }
}

export interface StartSsrGlobal {
  matches: Array<SsrMatch>
  streamedValues: Record<
    string,
    {
      value: any
      parsed: any
    }
  >
  cleanScripts: () => void
  dehydrated?: any
  initMatch: (match: SsrMatch) => void
  resolvePromise: (opts: {
    matchId: string
    id: number
    promiseState: DeferredPromiseState<any>
  }) => void
  injectChunk: (opts: { matchId: string; id: number; chunk: string }) => void
  closeStream: (opts: { matchId: string; id: number }) => void
}

export interface SsrMatch {
  id: string
  __beforeLoadContext: string
  loaderData?: string
  error?: string
  extracted?: Array<ClientExtractedEntry>
  updatedAt: MakeRouteMatch['updatedAt']
  status: MakeRouteMatch['status']
}

export type ClientExtractedEntry =
  | ClientExtractedStream
  | ClientExtractedPromise

export interface ClientExtractedPromise extends ClientExtractedBaseEntry {
  type: 'promise'
  value?: ControllablePromise<any>
}

export interface ClientExtractedStream extends ClientExtractedBaseEntry {
  type: 'stream'
  value?: ReadableStream & { controller?: ReadableStreamDefaultController }
}

export interface ClientExtractedBaseEntry {
  type: string
  path: Array<string>
}

export interface ResolvePromiseState {
  matchId: string
  id: number
  promiseState: DeferredPromiseState<any>
}

export interface DehydratedRouter {
  manifest: Manifest | undefined
  dehydratedData: any
}

export function hydrate(router: AnyRouter) {
  invariant(
    window.__TSR_SSR__?.dehydrated,
    'Expected to find a dehydrated data on window.__TSR_SSR__.dehydrated... but we did not. Please file an issue!',
  )

  const { manifest, dehydratedData } = startSerializer.parse(
    window.__TSR_SSR__.dehydrated,
  ) as DehydratedRouter

  router.ssr = {
    manifest,
    serializer: startSerializer,
  }

  router.clientSsr = {
    getStreamedValue: <T,>(key: string): T | undefined => {
      if (router.isServer) {
        return undefined
      }

      const streamedValue = window.__TSR_SSR__?.streamedValues[key]

      if (!streamedValue) {
        return
      }

      if (!streamedValue.parsed) {
        streamedValue.parsed = router.ssr!.serializer.parse(streamedValue.value)
      }

      return streamedValue.parsed
    },
  }

  // Hydrate the router state
  const matches = router.matchRoutes(router.state.location)
  // kick off loading the route chunks
  const routeChunkPromise = Promise.all(
    matches.map((match) => {
      const route = router.looseRoutesById[match.routeId]!
      return router.loadRouteChunk(route)
    }),
  )
  // Right after hydration and before the first render, we need to rehydrate each match
  // First step is to reyhdrate loaderData and __beforeLoadContext
  matches.forEach((match) => {
    const dehydratedMatch = window.__TSR_SSR__!.matches.find(
      (d) => d.id === match.id,
    )

    if (dehydratedMatch) {
      Object.assign(match, dehydratedMatch)

      // Handle beforeLoadContext
      if (dehydratedMatch.__beforeLoadContext) {
        match.__beforeLoadContext = router.ssr!.serializer.parse(
          dehydratedMatch.__beforeLoadContext,
        ) as any
      }

      // Handle loaderData
      if (dehydratedMatch.loaderData) {
        match.loaderData = router.ssr!.serializer.parse(
          dehydratedMatch.loaderData,
        )
      }

      // Handle error
      if (dehydratedMatch.error) {
        match.error = router.ssr!.serializer.parse(dehydratedMatch.error)
      }

      // Handle extracted
      ;(match as unknown as SsrMatch).extracted?.forEach((ex) => {
        deepMutableSetByPath(match, ['loaderData', ...ex.path], ex.value)
      })
    } else {
      Object.assign(match, {
        status: 'success',
        updatedAt: Date.now(),
      })
    }

    return match
  })

  router.__store.setState((s) => {
    return {
      ...s,
      matches,
    }
  })

  // Allow the user to handle custom hydration data
  router.options.hydrate?.(dehydratedData)

  // now that all necessary data is hydrated:
  // 1) fully reconstruct the route context
  // 2) execute `head()` and `scripts()` for each match
  router.state.matches.forEach((match) => {
    const route = router.looseRoutesById[match.routeId]!

    const parentMatch = router.state.matches[match.index - 1]
    const parentContext = parentMatch?.context ?? router.options.context ?? {}

    // `context()` was already executed by `matchRoutes`, however route context was not yet fully reconstructed
    // so run it again and merge route context
    const contextFnContext: RouteContextOptions<any, any, any, any> = {
      deps: match.loaderDeps,
      params: match.params,
      context: parentContext,
      location: router.state.location,
      navigate: (opts: any) =>
        router.navigate({ ...opts, _fromLocation: router.state.location }),
      buildLocation: router.buildLocation,
      cause: match.cause,
      abortController: match.abortController,
      preload: false,
      matches,
    }
    match.__routeContext = route.options.context?.(contextFnContext) ?? {}

    match.context = {
      ...parentContext,
      ...match.__routeContext,
      ...match.__beforeLoadContext,
    }

    const assetContext = {
      matches: router.state.matches,
      match,
      params: match.params,
      loaderData: match.loaderData,
    }
    const headFnContent = route.options.head?.(assetContext)

    const scripts = route.options.scripts?.(assetContext)

    match.meta = headFnContent?.meta
    match.links = headFnContent?.links
    match.headScripts = headFnContent?.scripts
    match.scripts = scripts
  })

  return routeChunkPromise
}

function deepMutableSetByPath<T>(obj: T, path: Array<string>, value: any) {
  // mutable set by path retaining array and object references
  if (path.length === 1) {
    ;(obj as any)[path[0]!] = value
  }

  const [key, ...rest] = path

  if (Array.isArray(obj)) {
    deepMutableSetByPath(obj[Number(key)], rest, value)
  } else if (isPlainObject(obj)) {
    deepMutableSetByPath((obj as any)[key!], rest, value)
  }
}
