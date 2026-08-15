import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })
}
