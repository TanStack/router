import { createRouteModuleRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouteModuleRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
}
