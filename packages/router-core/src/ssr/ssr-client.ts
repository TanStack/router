import invariant from 'tiny-invariant'
import { batch } from '../utils/batch'
import { isNotFound } from '../not-found'
import { createControlledPromise } from '../utils'
import {
  builtinDefaultDehydrate,
  getHydrateFn,
  resolveHandler,
  shouldDehydrate,
} from '../lifecycle'
import type { GLOBAL_SEROVAL, GLOBAL_TSR } from './constants'
import type { DehydratedMatch, TsrSsrGlobal } from './types'
import type { AnyRouteMatch } from '../Matches'
import type { AnyRouter } from '../router'
import type { AnySerializationAdapter } from './serializer/transformer'
import type { BeforeLoadContextOptions, ContextFnOptions } from '../route'

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
    [GLOBAL_SEROVAL]?: any
  }
}

function hydrateMatch(match: AnyRouteMatch, deyhydratedMatch: DehydratedMatch) {
  match.id = deyhydratedMatch.i
  match.status = deyhydratedMatch.s
  match.ssr = deyhydratedMatch.ssr
  match.updatedAt = deyhydratedMatch.u
  match.error = deyhydratedMatch.e

  // Wire payloads (when dehydrated) are applied later after we have access to route options
  // so we can run optional hydrate(wire) transforms.
}

export async function hydrate(router: AnyRouter): Promise<any> {
  invariant(
    window.$_TSR,
    'Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
  )

  const serializationAdapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined

  if (serializationAdapters?.length) {
    const fromSerializableMap = new Map()
    serializationAdapters.forEach((adapter) => {
      fromSerializableMap.set(adapter.key, adapter.fromSerializable)
    })
    window.$_TSR.t = fromSerializableMap
    window.$_TSR.buffer.forEach((script) => script())
  }
  window.$_TSR.initialized = true

  invariant(
    window.$_TSR.router,
    'Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
  )

  const { manifest, dehydratedData, lastMatchId } = window.$_TSR.router

  router.ssr = {
    manifest,
  }
  const meta = document.querySelector('meta[property="csp-nonce"]') as
    | HTMLMetaElement
    | undefined
  const nonce = meta?.content
  router.options.ssr = {
    nonce,
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

  function setMatchForcePending(match: AnyRouteMatch) {
    // usually the minPendingPromise is created in the Match component if a pending match is rendered
    // however, this might be too late if the match synchronously resolves
    const route = router.looseRoutesById[match.routeId]!
    const pendingMinMs =
      route.options.pendingMinMs ?? router.options.defaultPendingMinMs
    if (pendingMinMs) {
      const minPendingPromise = createControlledPromise<void>()
      match._nonReactive.minPendingPromise = minPendingPromise
      match._forcePending = true

      setTimeout(() => {
        minPendingPromise.resolve()
        // We've handled the minPendingPromise, so we can delete it
        router.updateMatch(match.id, (prev) => {
          prev._nonReactive.minPendingPromise = undefined
          return {
            ...prev,
            _forcePending: undefined,
          }
        })
      }, pendingMinMs)
    }
  }

  function setRouteSsr(match: AnyRouteMatch) {
    const route = router.looseRoutesById[match.routeId]
    if (route) {
      route.options.ssr = match.ssr
    }
  }
  // Right after hydration and before the first render, we need to rehydrate each match
  // First step is to reyhdrate loaderData and __beforeLoadContext
  let firstNonSsrMatchIndex: number | undefined = undefined
  matches.forEach((match) => {
    const dehydratedMatch = window.$_TSR!.router!.matches.find(
      (d) => d.i === match.id,
    )
    if (!dehydratedMatch) {
      match._nonReactive.dehydrated = false
      match.ssr = false
      setRouteSsr(match)
      return
    }

    hydrateMatch(match, dehydratedMatch)
    setRouteSsr(match)

    // Apply dehydrated wire payloads (and hydrate transforms if present)
    {
      const route = router.looseRoutesById[match.routeId]!
      if (dehydratedMatch.m !== undefined) {
        const hydrateFn = getHydrateFn(route.options.context)
        match.__routeContext = hydrateFn
          ? (hydrateFn({
              data: dehydratedMatch.m,
            }) as typeof match.__routeContext)
          : dehydratedMatch.m
      }
      if (dehydratedMatch.b !== undefined) {
        const hydrateFn = getHydrateFn(route.options.beforeLoad)
        match.__beforeLoadContext = hydrateFn
          ? (hydrateFn({
              data: dehydratedMatch.b,
            }) as typeof match.__beforeLoadContext)
          : dehydratedMatch.b
      }
      if (dehydratedMatch.l !== undefined) {
        const hydrateFn = getHydrateFn(route.options.loader)
        match.loaderData = hydrateFn
          ? (hydrateFn({ data: dehydratedMatch.l }) as typeof match.loaderData)
          : dehydratedMatch.l
      }
    }

    match._nonReactive.dehydrated = match.ssr !== false

    if (match.ssr === 'data-only' || match.ssr === false) {
      if (firstNonSsrMatchIndex === undefined) {
        firstNonSsrMatchIndex = match.index
        setMatchForcePending(match)
      }
    }
  })

  router.__store.setState((s) => {
    return {
      ...s,
      matches,
    }
  })

  // Allow the user to handle custom hydration data
  await router.options.hydrate?.(dehydratedData)

  const defaults = router.options.defaultDehydrate
  const additionalContext = router.options.additionalContext
  const location = router.state.location
  const navigate = (opts: any) =>
    router.navigate({ ...opts, _fromLocation: location })

  // Collect loader re-execution tasks for parallel phase
  const loaderTasks: Array<() => Promise<void>> = []

  // ── SERIAL PHASE ─────────────────────────────────────────────────────
  // Re-execute context, beforeLoad serially (parent→child)
  // to reconstruct the context chain. Also run head() and scripts().
  for (const match of router.state.matches) {
    try {
      const route = router.looseRoutesById[match.routeId]!

      const parentMatch = router.state.matches[match.index - 1]
      const parentContext = parentMatch?.context ?? router.options.context

      // --- context ---
      if (
        route.options.context &&
        !shouldDehydrate(
          route.options.context,
          defaults?.context,
          builtinDefaultDehydrate.context,
        )
      ) {
        const contextFnContext: ContextFnOptions<any, any, any, any, any> = {
          params: match.params,
          context: parentContext ?? {},
          deps: match.loaderDeps,
          location,
          navigate,
          buildLocation: router.buildLocation,
          cause: match.cause,
          abortController: match.abortController,
          preload: false,
          matches,
          routeId: route.id,
          ...additionalContext,
        }
        match.__routeContext =
          (await resolveHandler(route.options.context)!(contextFnContext)) ??
          undefined
      }
      match._nonReactive.needsContext = false

      const contextForBeforeLoad = {
        ...parentContext,
        ...match.__routeContext,
      }

      // --- beforeLoad ---
      if (
        route.options.beforeLoad &&
        !shouldDehydrate(
          route.options.beforeLoad,
          defaults?.beforeLoad,
          builtinDefaultDehydrate.beforeLoad,
        )
      ) {
        const beforeLoadFnContext: BeforeLoadContextOptions<
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any,
          any
        > = {
          search: match.search,
          params: match.params,
          context: contextForBeforeLoad,
          location,
          navigate,
          buildLocation: router.buildLocation,
          cause: match.cause,
          abortController: match.abortController,
          preload: false,
          matches,
          routeId: route.id,
          ...additionalContext,
        }
        match.__beforeLoadContext =
          (await resolveHandler(route.options.beforeLoad)!(
            beforeLoadFnContext,
          )) ?? undefined
      }

      // Reconstruct full context with all lifecycle contributions
      match.context = {
        ...parentContext,
        ...match.__routeContext,
        ...match.__beforeLoadContext,
      }

      // --- loader (collect for parallel phase) ---
      if (
        route.options.loader &&
        !shouldDehydrate(
          route.options.loader,
          defaults?.loader,
          builtinDefaultDehydrate.loader,
        )
      ) {
        const contextForLoader = {
          ...parentContext,
          ...match.__routeContext,
          ...match.__beforeLoadContext,
        }
        // Capture match/route in closure for deferred execution
        const capturedMatch = match
        const capturedRoute = route
        loaderTasks.push(async () => {
          try {
            const loaderFnContext = {
              params: capturedMatch.params,
              deps: capturedMatch.loaderDeps,
              context: contextForLoader,
              location,
              navigate,
              buildLocation: router.buildLocation,
              cause: capturedMatch.cause,
              abortController: capturedMatch.abortController,
              preload: false,
              parentMatchPromise: Promise.resolve() as any,
              route: capturedRoute,
              ...additionalContext,
            }
            const loaderData = await resolveHandler(
              capturedRoute.options.loader,
            )!(loaderFnContext)
            if (loaderData !== undefined) {
              capturedMatch.loaderData = loaderData
            }
          } catch (err) {
            capturedMatch.error = err as any
            console.error(
              `Error during hydration loader re-execution for route ${capturedMatch.routeId}:`,
              err,
            )
          }
        })
      }

      // Head & scripts
      const assetContext = {
        ssr: router.options.ssr,
        matches: router.state.matches,
        match,
        params: match.params,
        loaderData: match.loaderData,
      }
      const headFnContent = await route.options.head?.(assetContext)
      const scripts = await route.options.scripts?.(assetContext)

      match.meta = headFnContent?.meta
      match.links = headFnContent?.links
      match.headScripts = headFnContent?.scripts
      match.styles = headFnContent?.styles
      match.scripts = scripts
    } catch (err) {
      if (isNotFound(err)) {
        match.error = { isNotFound: true }
        console.error(
          `NotFound error during hydration for routeId: ${match.routeId}`,
          err,
        )
      } else {
        match.error = err as any
        console.error(`Error during hydration for route ${match.routeId}:`, err)
        throw err
      }
    }
  }

  // ── PARALLEL PHASE ───────────────────────────────────────────────────
  // Execute all loader re-executions in parallel after contexts are built
  if (loaderTasks.length > 0) {
    await Promise.all(loaderTasks.map((task) => task()))
  }

  const isSpaMode = matches[matches.length - 1]!.id !== lastMatchId
  const hasSsrFalseMatches = matches.some((m) => m.ssr === false)
  // all matches have data from the server and we are not in SPA mode so we don't need to kick of router.load()
  if (!hasSsrFalseMatches && !isSpaMode) {
    matches.forEach((match) => {
      // remove the dehydrated flag since we won't run router.load() which would remove it
      match._nonReactive.dehydrated = undefined
    })
    return routeChunkPromise
  }

  // schedule router.load() to run after the next tick so we can store the promise in the match before loading starts
  const loadPromise = Promise.resolve()
    .then(() => router.load())
    .catch((err) => {
      console.error('Error during router hydration:', err)
    })

  // in SPA mode we need to keep the first match below the root route pending until router.load() is finished
  // this will prevent that other pending components are rendered but hydration is not blocked
  if (isSpaMode) {
    const match = matches[1]
    invariant(
      match,
      'Expected to find a match below the root match in SPA mode.',
    )
    setMatchForcePending(match)

    match._displayPending = true
    match._nonReactive.displayPendingPromise = loadPromise

    loadPromise.then(() => {
      batch(() => {
        // ensure router is not in status 'pending' anymore
        // this usually happens in Transitioner but if loading synchronously resolves,
        // Transitioner won't be rendered while loading so it cannot track the change from loading:true to loading:false
        if (router.__store.state.status === 'pending') {
          router.__store.setState((s) => ({
            ...s,
            status: 'idle',
            resolvedLocation: s.location,
          }))
        }
        // hide the pending component once the load is finished
        router.updateMatch(match.id, (prev) => {
          return {
            ...prev,
            _displayPending: undefined,
            displayPendingPromise: undefined,
          }
        })
      })
    })
  }
  return routeChunkPromise
}
