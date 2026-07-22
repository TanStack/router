import {
  cacheLoaderMatch,
  getRoute,
  laneInputs,
  navigateFrom,
  projectLane,
  transferMatchResources,
  waitFor,
} from './load-client'
import { loadRouteChunk } from './route-chunks'
import { hydrateSsrMatchId } from './ssr/ssr-match-id'
import { deepEqual } from './utils'
import type { AnyRouteMatch } from './Matches'
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

  const controller = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = controller
  previousPreflight?.abort()
  const retire = (cause?: unknown) => {
    if (router._preflight === controller) {
      router._preflight = undefined
    }
    controller.abort(cause)
    return false
  }
  const isCurrent = () =>
    (!router._tx &&
      router._preflight === controller &&
      !controller.signal.aborted) ||
    retire()

  let location!: AnyRouter['latestLocation']
  let candidates!: Array<AnyRouteMatch>
  let handoffInputs!: ReturnType<typeof laneInputs>
  try {
    await waitFor(
      router.options.hydrate?.(dehydratedRouter!.dehydratedData),
      controller.signal,
    )
    if (!isCurrent()) {
      return
    }
    router.updateLatestLocation()
    location = router.latestLocation
    router.stores.location.set(location)
    handoffInputs = laneInputs(router, location)
    candidates = router.matchRoutes(location, {
      _controller: controller,
    })
  } catch (cause) {
    retire(cause)
    if (cause !== controller.signal) {
      throw cause
    }
  }
  if (!isCurrent()) {
    return
  }
  const committed: Array<AnyRouteMatch> = []
  let pendingBoundary: number | undefined
  let verifiedAssetEnd = 0
  const retryFrom = (index: number) => {
    // The failing route's identity is still verified, but no descendant is.
    verifiedAssetEnd = Math.min(verifiedAssetEnd, index + 1)
    const removed = committed.splice(index)
    for (const match of removed) {
      if (
        getRoute(router, match).options.loader &&
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

  // A longer server lane is valid only when the local match already caps the
  // branch at a global not-found boundary. Otherwise no transported work is
  // safe to attach to the shorter client lane.
  const shared =
    dehydratedMatches.length > candidates.length
      ? candidates.findIndex((match) => match._notFound) + 1
      : dehydratedMatches.length
  let isTerminal = false
  for (let index = 0; index < shared; index++) {
    const candidate = candidates[index]!
    const dehydrated = dehydratedMatches[index]!
    if (
      typeof dehydrated.i !== 'string' ||
      hydrateSsrMatchId(dehydrated.i) !== candidate.id
    ) {
      pendingBoundary ??= index
      break
    }
    verifiedAssetEnd = index + 1
    const route = getRoute(router, candidate)
    if (
      'l' in dehydrated ||
      (dehydrated.s === 'success' &&
        dehydrated.e === undefined &&
        route.options.loader)
    ) {
      candidate.loaderData = dehydrated.l
    }
    candidate.status = dehydrated.s
    candidate.ssr = dehydrated.ssr
    route.options.ssr = candidate.ssr
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
  let verifiedContextEnd = verifiedAssetEnd

  if (
    !isTerminal &&
    committed.length === shared &&
    shared < candidates.length
  ) {
    pendingBoundary = shared
  }

  // Hooks observe structural membership. Execution remains limited to
  // `committed`, the accepted server prefix.
  const chunks = committed.map(async (match) => {
    try {
      const route = getRoute(router, match)
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
      return true
    } catch {
      return false
    }
  })
  let chunkFailure = 0
  try {
    while (
      chunkFailure < chunks.length &&
      (await waitFor(chunks[chunkFailure]!, controller.signal))
    ) {
      chunkFailure++
    }
  } catch {
    isCurrent()
    return
  }
  if (!isCurrent()) {
    return
  }
  if (chunkFailure < committed.length) {
    verifiedContextEnd = Math.min(verifiedContextEnd, chunkFailure)
    retryFrom(chunkFailure)
  }

  // The first pending match is already visible, so prepare its route context
  // without granting its beforeLoad or loader any hydration authority.
  const contextEnd = Math.max(
    pendingBoundary === committed.length
      ? committed.length + 1
      : committed.length,
    verifiedContextEnd,
  )
  for (let index = 0; index < contextEnd; index++) {
    const match = candidates[index]!
    const route = getRoute(router, match)
    const parentContext =
      candidates[index - 1]?.context ?? router.options.context ?? {}
    let routeContext
    if (route.options.context) {
      try {
        routeContext = match._ctx =
          route.options.context({
            deps: match.loaderDeps,
            params: match.params,
            context: parentContext,
            location,
            navigate: navigateFrom(router, location),
            buildLocation: router.buildLocation,
            cause: match.cause,
            abortController: controller,
            preload: false,
            matches: candidates,
            routeId: route.id,
          }) || {}
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
      ...(committed[index] && dehydratedMatches[index]!.b),
    }
  }

  await projectLane(
    router,
    [location, candidates] as any,
    controller.signal,
    0,
    verifiedAssetEnd,
  )
  if (!isCurrent()) {
    return
  }
  const needsClientLoad =
    pendingBoundary !== undefined || committed.length < shared
  const committedMatches =
    isTerminal && committed.length === shared ? candidates : committed
  let presented = needsClientLoad ? candidates : committedMatches
  let dataOnlyAssetEnd: number | undefined
  if (needsClientLoad && pendingBoundary !== undefined) {
    const boundary = presented[pendingBoundary]!
    dataOnlyAssetEnd =
      boundary.status === 'success' &&
      boundary.ssr === 'data-only' &&
      boundary.error === undefined &&
      !boundary._notFound &&
      verifiedAssetEnd > pendingBoundary + 1
        ? verifiedAssetEnd
        : undefined
    presented = presented.slice()
    presented[pendingBoundary] = {
      ...boundary,
      status: 'pending',
      ssr: boundary.ssr === 'data-only' ? 'data-only' : false,
      _assetEnd: dataOnlyAssetEnd,
    }
  }

  const claim = () =>
    needsClientLoad &&
    !router._tx &&
    router.latestLocation.state === location.state &&
    deepEqual(handoffInputs, laneInputs(router, router.latestLocation)) &&
    router._committed === committedMatches &&
    committedMatches.length &&
    !controller.signal.aborted
      ? controller
      : undefined
  const handoff: NonNullable<AnyRouter['_handoff']> = [
    claim,
    (matches) => {
      if (router._handoff !== handoff) {
        return
      }
      const prefix = committedMatches.length
      if (
        !matches ||
        !claim() ||
        committedMatches.some((match, index) => match.id !== matches[index]?.id)
      ) {
        router._handoff = undefined
        controller.abort()
        return
      }
      let handoffAssetEnd = dataOnlyAssetEnd
      if (handoffAssetEnd !== undefined) {
        for (let index = prefix; index < handoffAssetEnd; index++) {
          if (candidates[index]?.id !== matches[index]?.id) {
            handoffAssetEnd =
              index > (pendingBoundary ?? -1) + 1 ? index : undefined
            break
          }
        }
      }
      const clones = committedMatches.map((match) => ({ ...match }))
      if (handoffAssetEnd !== undefined) {
        clones[pendingBoundary!]!._assetEnd = handoffAssetEnd
      }
      transferMatchResources(router, matches.splice(0, prefix, ...clones))
      for (let index = prefix; index < matches.length; index++) {
        const match = matches[index]!
        const hydrated = candidates[index]
        if (hydrated?.id === match.id && hydrated._ctx) {
          match._ctx = hydrated._ctx
        }
        match.abortController = controller
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
