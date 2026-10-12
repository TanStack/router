const $$splitComponentImporter = () =>
  import('arrow-function.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/solid-router'
import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
if (import.meta.hot) {
  const hot = import.meta.hot
  const hotData = (hot.data ??= {})
  const handleRouteUpdate = function handleRouteUpdate(routeId, newRoute) {
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
      ;[].forEach((key) => {
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
  }
  const initialRouteId = Route.id ?? hotData['tsr-route-id']
  if (initialRouteId) {
    hotData['tsr-route-id'] = initialRouteId
  }
  const existingRoute =
    typeof window !== 'undefined' && initialRouteId
      ? window.__TSR_ROUTER__?.routesById?.[initialRouteId]
      : undefined
  if (initialRouteId && existingRoute && existingRoute !== Route) {
    handleRouteUpdate(initialRouteId, Route)
    hotData['tsr-route-update-handled'] = Route
  }
  hot.accept((newModule) => {
    if (Route && newModule?.Route) {
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
