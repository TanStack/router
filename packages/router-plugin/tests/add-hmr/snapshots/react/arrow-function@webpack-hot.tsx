const $$splitComponentImporter = () =>
  import('arrow-function.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
const TSRSplitComponent = (() => {
  const hot = import.meta.webpackHot
  const hotData = hot ? (hot.data ??= {}) : undefined
  return (
    hotData?.['tsr-split-component:component'] ??
    lazyRouteComponent($$splitComponentImporter, 'component')
  )
})()
if (import.meta.webpackHot) {
  ;(import.meta.webpackHot.data ??= {})['tsr-split-component:component'] =
    TSRSplitComponent
}
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: TSRSplitComponent,
})
if (import.meta.webpackHot) {
  const hot = import.meta.webpackHot
  const hotData = (hot.data ??= {})
  const routeId =
    hotData['tsr-route-id'] ??
    Route.id ??
    (Route.isRoot ? '__root__' : undefined)
  if (routeId) {
    hotData['tsr-route-id'] = routeId
  }
  if (
    routeId &&
    typeof window !== 'undefined' &&
    window.__TSR_ROUTER__ &&
    (function handleRouteUpdate(routeId, newRoute) {
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
    })(routeId, Route)
  ) {
    try {
      const tsrReactRefreshUtils =
        typeof __react_refresh_utils__ !== 'undefined'
          ? __react_refresh_utils__
          : undefined
      const tsrEnqueueUpdate =
        tsrReactRefreshUtils &&
        typeof tsrReactRefreshUtils.enqueueUpdate === 'function'
          ? tsrReactRefreshUtils.enqueueUpdate
          : undefined
      if (tsrEnqueueUpdate) {
        tsrEnqueueUpdate(() => {})
      }
    } catch (_err) {}
  }
  hot.dispose((data) => {
    if (routeId) {
      data['tsr-route-id'] = routeId
    }
  })
  hot.accept()
}
