import * as template from '@babel/template'
import { createHmrHotExpressionAst } from './hmr-hot-expression'
import type { AnyRoute, AnyRouteMatch, AnyRouter } from '@tanstack/router-core'

type AnyRouteWithPrivateProps = AnyRoute & {
  options: Record<string, unknown>
  _componentsPromise?: Promise<void>
  _lazyPromise?: Promise<void>
  update: (options: Record<string, unknown>) => unknown
  _path: string
  _id: string
  _fullPath: string
  _to: string
}

type AnyRouterWithPrivateMaps = AnyRouter & {
  routesById: Record<string, AnyRoute>
  routesByPath: Record<string, AnyRoute>
  stores: AnyRouter['stores'] & {
    cachedMatchStoresById: Map<
      string,
      {
        setState: (updater: (prev: AnyRouteMatch) => AnyRouteMatch) => void
      }
    >
    pendingMatchStoresById: Map<
      string,
      {
        setState: (updater: (prev: AnyRouteMatch) => AnyRouteMatch) => void
      }
    >
    activeMatchStoresById: Map<
      string,
      {
        setState: (updater: (prev: AnyRouteMatch) => AnyRouteMatch) => void
      }
    >
  }
}

type AnyRouteMatchWithPrivateProps = AnyRouteMatch & {
  __beforeLoadContext?: unknown
}

function handleRouteUpdate(
  routeId: string,
  newRoute: AnyRouteWithPrivateProps,
) {
  const router = window.__TSR_ROUTER__ as AnyRouterWithPrivateMaps
  const oldRoute = router.routesById[routeId] as
    | AnyRouteWithPrivateProps
    | undefined

  if (!oldRoute) {
    return
  }

  // Keys whose identity must remain stable to prevent React from
  // unmounting/remounting the component tree.  React Fast Refresh already
  // handles hot-updating the function bodies of these components — our job
  // is only to update non-component route options (loader, head, etc.).
  // For code-split (splittable) routes, the lazyRouteComponent wrapper is
  // already cached in the bundler hot data so its identity is stable.
  // For unsplittable routes (e.g. root routes), the component is a plain
  // function reference that gets recreated on every module re-execution,
  // so we must explicitly preserve the old reference.
  const removedKeys = new Set<string>()
  Object.keys(oldRoute.options).forEach((key) => {
    if (!(key in newRoute.options)) {
      removedKeys.add(key)
      delete oldRoute.options[key]
    }
  })

  // Preserve component identity so React doesn't remount.
  // React Fast Refresh patches the function bodies in-place.
  const componentKeys = '__TSR_COMPONENT_TYPES__' as unknown as Array<string>
  componentKeys.forEach((key) => {
    if (key in oldRoute.options && key in newRoute.options) {
      newRoute.options[key] = oldRoute.options[key]
    }
  })

  oldRoute.options = newRoute.options
  oldRoute.update(newRoute.options)
  oldRoute._componentsPromise = undefined
  oldRoute._lazyPromise = undefined

  router.routesById[oldRoute.id] = oldRoute
  router.routesByPath[oldRoute.fullPath] = oldRoute

  router.processedTree.matchCache.clear()
  router.processedTree.flatCache?.clear()
  router.processedTree.singleCache.clear()
  router.resolvePathCache.clear()
  walkReplaceSegmentTree(oldRoute, router.processedTree.segmentTree)

  const filter = (m: AnyRouteMatch) => m.routeId === oldRoute.id
  const activeMatch = router.stores.activeMatchesSnapshot.state.find(filter)
  const pendingMatch = router.stores.pendingMatchesSnapshot.state.find(filter)
  const cachedMatches = router.stores.cachedMatchesSnapshot.state.filter(filter)

  if (activeMatch || pendingMatch || cachedMatches.length > 0) {
    // Clear stale match data for removed route options BEFORE invalidating.
    // Without this, router.invalidate() -> matchRoutes() reuses the existing
    // match from the store (via ...existingMatch spread) and the stale
    // loaderData / __beforeLoadContext survives the reload cycle.
    //
    // We must update the store directly (not via router.updateMatch) because
    // updateMatch wraps in startTransition which may defer the state update,
    // and we need the clear to be visible before invalidate reads the store.
    if (removedKeys.has('loader') || removedKeys.has('beforeLoad')) {
      const matchIds = [
        activeMatch?.id,
        pendingMatch?.id,
        ...cachedMatches.map((match) => match.id),
      ].filter(Boolean) as Array<string>
      router.batch(() => {
        for (const matchId of matchIds) {
          const store =
            router.stores.pendingMatchStoresById.get(matchId) ||
            router.stores.activeMatchStoresById.get(matchId) ||
            router.stores.cachedMatchStoresById.get(matchId)
          if (store) {
            store.setState((prev) => {
              const next: AnyRouteMatchWithPrivateProps = { ...prev }

              if (removedKeys.has('loader')) {
                next.loaderData = undefined
              }
              if (removedKeys.has('beforeLoad')) {
                next.__beforeLoadContext = undefined
              }

              return next
            })
          }
        }
      })
    }

    router.invalidate({ filter, sync: true })
  }

  function walkReplaceSegmentTree(
    route: AnyRouteWithPrivateProps,
    node: AnyRouter['processedTree']['segmentTree'],
  ) {
    if (node.route?.id === route.id) node.route = route
    if (node.index) walkReplaceSegmentTree(route, node.index)
    node.static?.forEach((child) => walkReplaceSegmentTree(route, child))
    node.staticInsensitive?.forEach((child) =>
      walkReplaceSegmentTree(route, child),
    )
    node.dynamic?.forEach((child) => walkReplaceSegmentTree(route, child))
    node.optional?.forEach((child) => walkReplaceSegmentTree(route, child))
    node.wildcard?.forEach((child) => walkReplaceSegmentTree(route, child))
  }
}

const handleRouteUpdateStr = handleRouteUpdate.toString()

export function createRouteHmrStatement(
  stableRouteOptionKeys: Array<string>,
  opts?: { hotExpression?: string },
) {
  return template.statement(
    `
if (%%hotExpression%%) {
  const hot = %%hotExpression%%
  const hotData = hot.data ??= {}
  hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? Route.id
      if (routeId) {
        hotData['tsr-route-id'] = routeId
      }
      (${handleRouteUpdateStr.replace(
        /['"]__TSR_COMPONENT_TYPES__['"]/,
        JSON.stringify(stableRouteOptionKeys),
      )})(routeId, newModule.Route)
    }
    })
}
`,
    {
      syntacticPlaceholders: true,
    },
  )({
    hotExpression: createHmrHotExpressionAst(opts?.hotExpression),
  })
}
