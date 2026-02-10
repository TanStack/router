import { createRoute, createRouter } from '@tanstack/react-router'
import { routeTree as fileRouteTree } from './routeTree.gen'

const shouldLoadRemoteRouteRegistrations =
  typeof window !== 'undefined' || process.env.HOST_MODE === 'ssr'

const remoteRouteRegistrations = shouldLoadRemoteRouteRegistrations
  ? (await import('mf_remote/routes')).remoteRouteRegistrations
  : []

const dynamicRemoteRoutes = remoteRouteRegistrations.map((registration) =>
  createRoute({
    getParentRoute: () => fileRouteTree,
    path: registration.path,
    component: registration.component,
  }),
)

const routeTree = fileRouteTree.addChildren(
  [...(fileRouteTree.children ?? []), ...dynamicRemoteRoutes] as any,
)

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
  })
}
