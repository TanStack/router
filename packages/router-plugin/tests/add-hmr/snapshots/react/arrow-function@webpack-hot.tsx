const $$splitComponentImporter = () =>
  import('arrow-function.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
const TSRSplitComponent =
  (import.meta.webpackHot
    ? (import.meta.webpackHot.data ??= {})['tsr-split-component:component']
    : undefined) ?? lazyRouteComponent($$splitComponentImporter, 'component')
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
  const existingRoute =
    typeof window !== 'undefined' && routeId
      ? window.__TSR_ROUTER__?.routesById?.[routeId]
      : undefined
  if (routeId && existingRoute && existingRoute !== Route) {
    ;(function handleRouteUpdate(routeId, newRoute) {
      const router = window.__TSR_ROUTER__
      const oldRoute = router.routesById[routeId]
      if (!oldRoute) {
        return
      }
      const generatedRouteOptionKeys = ['id', 'path', 'getParentRoute']
      const generatedRouteOptions = {}
      generatedRouteOptionKeys.forEach((key) => {
        if (key in oldRoute.options) {
          generatedRouteOptions[key] = oldRoute.options[key]
        }
      })
      if (
        'shellComponent' in oldRoute.options ===
        'shellComponent' in newRoute.options
      ) {
        ;[
          'component',
          'shellComponent',
          'pendingComponent',
          'errorComponent',
          'notFoundComponent',
        ].forEach((key) => {
          if (key in oldRoute.options && key in newRoute.options) {
            newRoute.options[key] = oldRoute.options[key]
          }
        })
      }
      const nextOptions = { ...newRoute.options, ...generatedRouteOptions }
      oldRoute.options = nextOptions
      oldRoute.update(nextOptions)
      router._replaceRouteChunk(oldRoute, newRoute.lazyFn)
      router.setRoutes(router.buildRouteTree())
      newRoute.options = oldRoute.options
      newRoute.parentRoute = oldRoute.parentRoute
      newRoute._path = oldRoute._path
      newRoute._id = oldRoute._id
      newRoute._fullPath = oldRoute._fullPath
      newRoute._to = oldRoute._to
      router.resolvePathCache.clear()
      router._refreshRoute?.()
    })(routeId, Route)
    try {
      const tsrReactRefreshUtils =
        typeof __react_refresh_utils__ !== 'undefined'
          ? __react_refresh_utils__
          : undefined
      const tsrEnqueueUpdate = tsrReactRefreshUtils?.enqueueUpdate
      if (typeof tsrEnqueueUpdate === 'function') {
        tsrEnqueueUpdate(() => {})
      }
    } catch {}
  }
  hot.dispose((data) => {
    if (routeId) {
      data['tsr-route-id'] = routeId
    }
  })
  hot.accept()
}
