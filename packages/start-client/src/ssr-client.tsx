import { isPlainObject } from '@tanstack/react-router'

import invariant from 'tiny-invariant'

import { startSerializer } from './serializer'
import type {
  AnyRouter,
  ControllablePromise,
  DeferredPromiseState,
  MakeRouteMatch,
  Manifest,
} from '@tanstack/react-router'

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
  const matches = router.matchRoutes(router.state.location).map((match) => {
    const route = router.looseRoutesById[match.routeId]!

    // Right after hydration and before the first render, we need to rehydrate each match
    // This includes rehydrating the loaderData and also using the beforeLoadContext
    // to reconstruct any context that was serialized on the server

    const dehydratedMatch = window.__TSR_SSR__!.matches.find(
      (d) => d.id === match.id,
    )

    if (dehydratedMatch) {
      Object.assign(match, dehydratedMatch)

      const parentMatch = router.state.matches[match.index - 1]
      const parentContext = parentMatch?.context ?? router.options.context ?? {}

      // Handle beforeLoadContext
      if (dehydratedMatch.__beforeLoadContext) {
        match.__beforeLoadContext = router.ssr!.serializer.parse(
          dehydratedMatch.__beforeLoadContext,
        ) as any

        match.context = {
          ...parentContext,
          ...match.context,
          ...match.__beforeLoadContext,
        }
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

    const headFnContent = route.options.head?.({
      matches: router.state.matches,
      match,
      params: match.params,
      loaderData: match.loaderData,
    })

    Object.assign(match, {
      meta: headFnContent?.meta,
      links: headFnContent?.links,
      scripts: headFnContent?.scripts,
    })

    return match
  })

  router.__store.setState((s) => {
    return {
      ...s,
      matches: matches,
    }
  })

  // Allow the user to handle custom hydration data
  router.options.hydrate?.(dehydratedData)
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
