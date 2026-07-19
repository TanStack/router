import {
  cacheLoaderMatch,
  projectLane,
  transferMatchResources,
} from './load-client'
import { loadRouteChunk } from './route-chunks'
import type { AnyRouteMatch } from './Matches'
import type { AnyRoute } from './route'
import type { AnyRouter } from './router'
import type { GLOBAL_SEROVAL, GLOBAL_TSR } from './ssr/constants'
import type { AnySerializationAdapter } from './ssr/serializer/transformer'
import type { TsrSsrGlobal } from './ssr/types'

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
    [GLOBAL_SEROVAL]?: any
  }
}

export async function hydrate(router: AnyRouter): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && !window.$_TSR) {
    throw new Error(
      'Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
    )
  }
  const tsr = window.$_TSR!

  const adapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  if (adapters?.length) {
    tsr.t = new Map(
      adapters.map((adapter) => [adapter.key, adapter.fromSerializable]),
    )
    tsr.buffer.forEach((script) => script())
  }
  tsr.initialized = true

  const dehydratedRouter = tsr.router
  if (process.env.NODE_ENV !== 'production' && !dehydratedRouter) {
    throw new Error(
      'Invariant failed: Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
    )
  }
  router.ssr = { manifest: dehydratedRouter!.manifest }
  const nonce = (
    document.querySelector('meta[property="csp-nonce"]') as
      | HTMLMetaElement
      | undefined
  )?.content
  router.options.ssr = { nonce }

  const dehydratedMatches = dehydratedRouter!.matches

  await router.options.hydrate?.(dehydratedRouter!.dehydratedData)
  router.updateLatestLocation()
  const location = router.latestLocation
  router.stores.location.set(location)

  const controller = new AbortController()
  router._preflight = controller
  const isCurrent = () => {
    const current =
      !router._tx &&
      router._preflight === controller &&
      !controller.signal.aborted
    if (!current) {
      controller.abort()
    }
    return current
  }

  const candidates = router.matchRoutes(location, {
    _controller: controller,
  })
  const committed: Array<AnyRouteMatch> = []
  let pendingBoundary: number | undefined
  const retryFrom = (index: number) => {
    const removed = committed.splice(index)
    for (const match of removed) {
      if (
        (router.routesById as Record<string, AnyRoute>)[match.routeId]!.options
          .loader &&
        (match.status === 'success' ||
          (!match.invalid && 'loaderData' in match))
      ) {
        cacheLoaderMatch(
          router,
          {
            ...match,
            status: 'success',
            error: undefined,
            preload: true,
          },
          router._cache.get(match.id),
        )
      }
    }
    transferMatchResources(router, removed)
  }

  const shared = dehydratedMatches.length
  let isTerminal = false
  for (let index = 0; index < shared; index++) {
    const candidate = candidates[index]!
    const dehydrated = dehydratedMatches[index]!
    if ('l' in dehydrated) {
      candidate.loaderData = dehydrated.l
    }
    candidate.status = dehydrated.s
    candidate.ssr = dehydrated.ssr
    ;(router.routesById as Record<string, AnyRoute>)[
      candidate.routeId
    ]!.options.ssr = candidate.ssr
    candidate.updatedAt = dehydrated.u
    candidate.error = dehydrated.e
    candidate._notFound ||= dehydrated.g
    const terminal =
      candidate.status === 'error' ||
      candidate.status === 'notFound' ||
      candidate._notFound
    if (terminal) {
      isTerminal = true
      committed.push(candidate)
      if (candidate.ssr === false || candidate.ssr === 'data-only') {
        pendingBoundary ??= index
      }
      break
    }
    if (candidate.status === 'pending') {
      pendingBoundary ??= index
      break
    }

    committed.push(candidate)
    if (candidate.ssr === 'data-only') {
      pendingBoundary ??= index
    }
  }

  if (
    !isTerminal &&
    committed.length === shared &&
    shared < candidates.length
  ) {
    pendingBoundary = shared
  }

  // Hooks observe structural membership. Execution remains limited to
  // `committed`, the accepted server prefix.
  const chunkFailures = await Promise.all(
    committed.map(async (match, index) => {
      try {
        const route = (router.routesById as Record<string, AnyRoute>)[
          match.routeId
        ]!
        if (match._notFound) {
          await Promise.all([
            loadRouteChunk(route),
            loadRouteChunk(route, 'notFoundComponent'),
          ])
        } else {
          await loadRouteChunk(
            route,
            match.status === 'error'
              ? 'errorComponent'
              : match.status === 'notFound'
                ? 'notFoundComponent'
                : undefined,
          )
        }
        return undefined
      } catch {
        return index
      }
    }),
  )
  const chunkFailure = chunkFailures.find((index) => index !== undefined)
  if (chunkFailure !== undefined) {
    retryFrom(chunkFailure)
  }

  // Build every accepted context before any head hook receives the lane.
  for (let index = 0; index < committed.length; index++) {
    const match = committed[index]!
    const route = (router.routesById as Record<string, AnyRoute>)[
      match.routeId
    ]!
    const parentContext =
      committed[index - 1]?.context ?? router.options.context
    let routeContext
    if (route.options.context) {
      try {
        routeContext = route.options.context({
          deps: match.loaderDeps,
          params: match.params,
          context: parentContext ?? {},
          location,
          navigate: (opts: any) =>
            router.navigate({ ...opts, _fromLocation: location }),
          buildLocation: router.buildLocation,
          cause: match.cause,
          abortController: controller,
          preload: false,
          matches: candidates,
          routeId: route.id,
        })
        match._ctx = routeContext || {}
      } catch {
        if (!isCurrent()) {
          return
        }
        if (
          match.status !== 'error' &&
          match.status !== 'notFound' &&
          !match._notFound
        ) {
          retryFrom(index)
          break
        }
      }
      if (!isCurrent()) {
        return
      }
    }
    match.context = {
      ...parentContext,
      ...routeContext,
      ...dehydratedMatches[index]!.b,
    }
  }

  await projectLane(
    router,
    [location, candidates] as any,
    controller.signal,
    0,
    committed.length,
  )
  const needsClientLoad =
    pendingBoundary !== undefined || committed.length < shared
  const committedMatches =
    isTerminal && committed.length === shared ? candidates : committed
  let presented = needsClientLoad ? candidates : committedMatches
  if (needsClientLoad && pendingBoundary !== undefined) {
    presented = presented.slice()
    presented[pendingBoundary] = {
      ...presented[pendingBoundary]!,
      status: 'pending',
      ssr:
        presented[pendingBoundary]!.ssr === 'data-only' ? 'data-only' : false,
    }
  }

  const handoff: NonNullable<AnyRouter['_handoff']> = [
    () =>
      needsClientLoad &&
      !router._tx &&
      router._committed === committedMatches &&
      !!committedMatches.length &&
      !controller.signal.aborted
        ? controller
        : undefined,
    (matches) => {
      const owns = router._handoff === handoff
      if (
        !matches ||
        !owns ||
        router._tx ||
        controller.signal.aborted ||
        router._committed !== committedMatches
      ) {
        if (owns) {
          router._handoff = undefined
          controller.abort()
        }
        return
      }
      const prefix = committedMatches.length
      transferMatchResources(
        router,
        matches.splice(
          0,
          prefix,
          ...committedMatches.map((match) => ({ ...match })),
        ),
      )
      for (let index = prefix; index < matches.length; index++) {
        matches[index]!.abortController = controller
      }
      return prefix
    },
  ]
  router._committed = committedMatches
  router._handoff = handoff
  router._preflight = undefined
  router.batch(() => {
    router.stores.setMatches(presented)
    router.stores.status.set('idle')
    if (!needsClientLoad) {
      router.stores.resolvedLocation.set(router.stores.location.get())
    }
  })
}
