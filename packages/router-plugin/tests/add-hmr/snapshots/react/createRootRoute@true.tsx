import * as React from 'react'
import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: RootComponent })
function RootComponent() {
  return <div>Hello</div>
}
const hot = import.meta.hot
if (hot && typeof window !== 'undefined') {
  hot.data ??= {}
  const tsrReactRefresh = (window.__TSR_REACT_REFRESH__ ??= (() => {
    const ignoredExportsById = new Map()
    const previousGetIgnoredExports = window.__getReactRefreshIgnoredExports
    window.__getReactRefreshIgnoredExports = (ctx) => {
      const ignoredExports = previousGetIgnoredExports?.(ctx) ?? []
      const moduleIgnored = ignoredExportsById.get(ctx.id) ?? []
      return [...ignoredExports, ...moduleIgnored]
    }
    return { ignoredExportsById }
  })())
  tsrReactRefresh.ignoredExportsById.set('createRootRoute.tsx', ['Route'])
}
export function TSRFastRefreshAnchor() {
  return null
}
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = (hot.data ??= {})
  const handleRouteUpdate = function handleRouteUpdate(routeId, newRoute) {
    const router = window.__TSR_ROUTER__
    const oldRoute = router.routesById[routeId]
    const liveRoutes = oldRoute
      ? [oldRoute]
      : Object.values(router.routesById).filter(
          (route) =>
            route._template && route.id.replace(/#[^:]*:/, ':') === routeId,
        )
    const previousRoute = oldRoute ?? liveRoutes[0]?._template
    if (!previousRoute || previousRoute === newRoute) {
      return false
    }
    const generatedRouteOptionKeys = [
      'id',
      'path',
      'getParentRoute',
      '_module',
      '_uses',
    ]
    const oldHasShellComponent = 'shellComponent' in previousRoute.options
    const newHasShellComponent = 'shellComponent' in newRoute.options
    const preserveComponentIdentity =
      oldHasShellComponent === newHasShellComponent
    const componentKeys = [
      'component',
      'shellComponent',
      'pendingComponent',
      'errorComponent',
      'notFoundComponent',
    ]
    if (preserveComponentIdentity) {
      componentKeys.forEach((key) => {
        if (key in previousRoute.options && key in newRoute.options) {
          newRoute.options[key] = previousRoute.options[key]
        }
      })
    }
    const updateRoute = (route) => {
      const nextOptions = { ...newRoute.options }
      generatedRouteOptionKeys.forEach((key) => {
        if (key in route.options) {
          nextOptions[key] = route.options[key]
        }
      })
      route.options = nextOptions
      route.update(nextOptions)
    }
    liveRoutes.forEach((liveRoute) => {
      updateRoute(liveRoute)
      router._replaceRouteChunk(liveRoute, newRoute.lazyFn)
    })
    if (!oldRoute) {
      updateRoute(previousRoute)
    }
    router.setRoutes(router.buildRouteTree())
    syncHotRouteExport(previousRoute)
    if (!oldRoute) {
      liveRoutes.forEach((liveRoute) => {
        liveRoute._template = newRoute
      })
    }
    router.resolvePathCache.clear()
    void router._refreshRoute?.()
    return true
    function syncHotRouteExport(liveRoute) {
      newRoute.options = liveRoute.options
      newRoute.parentRoute = liveRoute.parentRoute
      newRoute._path = liveRoute._path
      newRoute._id = liveRoute._id
      newRoute._fullPath = liveRoute._fullPath
      newRoute._to = liveRoute._to
    }
  }
  const initialRouteId = Route.id ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  if (
    initialRouteId &&
    typeof window !== 'undefined' &&
    window.__TSR_ROUTER__ &&
    handleRouteUpdate(initialRouteId, Route)
  ) {
    hotData['tsr-route-update-handled'] = Route
  }
  hot.accept((newModule) => {
    if (Route && newModule && newModule.Route) {
      const routeId = hotData['tsr-route-id'] ?? Route.id
      if (routeId) {
        hotData['tsr-route-id'] = routeId
      }
      if (hotData['tsr-route-update-handled'] === newModule.Route) {
        delete hotData['tsr-route-update-handled']
        return
      }
      handleRouteUpdate(routeId, newModule.Route)
    }
  })
}
