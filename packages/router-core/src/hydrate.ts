import { invariant } from './invariant'
import { isNotFound } from './not-found'
import { loadRouteChunk } from './route-chunks'
import { hydrateSsrMatchId } from './ssr/ssr-match-id'
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
  if (!window.$_TSR) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
      )
    }
    invariant()
  }

  const adapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  if (adapters?.length) {
    window.$_TSR.t = new Map(
      adapters.map((adapter) => [adapter.key, adapter.fromSerializable]),
    )
    window.$_TSR.buffer.forEach((script) => script())
  }
  window.$_TSR.initialized = true

  const dehydratedRouter = window.$_TSR.router
  if (!dehydratedRouter) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
      )
    }
    invariant()
  }

  for (const match of dehydratedRouter.matches) {
    match.i = hydrateSsrMatchId(match.i)
  }
  router.ssr = { manifest: dehydratedRouter.manifest }
  const nonce = (
    document.querySelector('meta[property="csp-nonce"]') as
      | HTMLMetaElement
      | undefined
  )?.content
  router.options.ssr = { nonce }

  const owner = router._tx
  const isCurrent = () => router._tx === owner

  await router.options.hydrate?.(dehydratedRouter.dehydratedData)
  if (!isCurrent()) {
    return
  }
  router.updateLatestLocation()
  const location = router.latestLocation
  router.stores.location.set(location)

  const candidates = router.matchRoutes(location)
  const committed: Array<AnyRouteMatch> = []
  let index = 0
  let needsClientLoad: true | undefined

  for (const candidate of candidates) {
    const dehydrated = dehydratedRouter.matches[index]
    if (!dehydrated || dehydrated.i !== candidate.id) {
      needsClientLoad = true
      break
    }
    index++
    candidate.__beforeLoadContext = dehydrated.b
    candidate.loaderData = dehydrated.l
    candidate.status = dehydrated.s
    candidate.ssr = dehydrated.ssr
    ;(router.routesById as Record<string, AnyRoute>)[
      candidate.routeId
    ]!.options.ssr = candidate.ssr
    candidate.updatedAt = dehydrated.u
    candidate.error = dehydrated.e
    candidate.globalNotFound = dehydrated.g ?? candidate.globalNotFound

    if (candidate.ssr === false || candidate.status === 'pending') {
      needsClientLoad = true
      break
    }

    committed.push(candidate)
    if (
      candidate.status === 'error' ||
      candidate.status === 'notFound' ||
      candidate.globalNotFound
    ) {
      break
    }
  }

  try {
    await Promise.all(
      committed.map(async (match) => {
        const route = (router.routesById as Record<string, AnyRoute>)[
          match.routeId
        ]!
        if (match.globalNotFound) {
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
      }),
    )
  } catch (cause) {
    if (!isCurrent()) {
      return
    }
    throw cause
  }
  if (!isCurrent()) {
    return
  }

  // Install lazy options first, then build every context before any head hook
  // receives the lane through `matches`.
  for (const match of committed) {
    const route = (router.routesById as Record<string, AnyRoute>)[
      match.routeId
    ]!
    const parentContext =
      committed[match.index - 1]?.context ?? router.options.context
    if (route.options.context) {
      match.__routeContext =
        (await route.options.context({
          deps: match.loaderDeps,
          params: match.params,
          context: parentContext ?? {},
          location,
          navigate: (opts: any) =>
            router.navigate({ ...opts, _fromLocation: location }),
          buildLocation: router.buildLocation,
          cause: match.cause,
          abortController: match.abortController,
          preload: false,
          matches: committed,
          routeId: route.id,
        })) ?? undefined
      if (!isCurrent()) {
        return
      }
    }
    match.context = {
      ...parentContext,
      ...match.__routeContext,
      ...match.__beforeLoadContext,
    }
  }

  for (const match of committed) {
    try {
      const route = (router.routesById as Record<string, AnyRoute>)[
        match.routeId
      ]!
      const context = {
        ssr: router.options.ssr,
        matches: committed,
        match,
        params: match.params,
        loaderData: match.loaderData,
      }
      const head = await route.options.head?.(context)
      if (!isCurrent()) {
        return
      }
      const scripts = await route.options.scripts?.(context)
      if (!isCurrent()) {
        return
      }
      match.meta = head?.meta
      match.links = head?.links
      match.headScripts = head?.scripts
      match.styles = head?.styles
      match.scripts = scripts
    } catch (cause) {
      if (!isCurrent()) {
        return
      }
      if (isNotFound(cause)) {
        match.error = { isNotFound: true }
        console.error(
          `NotFound error during hydration for routeId: ${match.routeId}`,
          cause,
        )
      } else {
        match.error = cause
        console.error(
          `Error during hydration for route ${match.routeId}:`,
          cause,
        )
        throw cause
      }
    }
  }

  let presented = candidates.slice(0, index)
  for (let boundary = 0; boundary < committed.length; boundary++) {
    if (committed[boundary]!.ssr === 'data-only') {
      presented = presented.slice(0, boundary + 1)
      presented[boundary] = {
        ...presented[boundary]!,
        status: 'pending',
      }
      needsClientLoad = true
      break
    }
  }

  router._committedMatches = committed
  router.batch(() => {
    router.stores.setMatches(presented)
    router.stores.status.set('idle')
    if (!needsClientLoad) {
      router.stores.resolvedLocation.set(router.stores.location.get())
    }
  })
}
