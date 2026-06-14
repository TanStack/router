import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
import {
  createMaskingRewrite,
  initialPublicHref,
  routerBasepath,
} from '../../shared.ts'
import { photoModalMask, routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [initialPublicHref],
    }),
    basepath: routerBasepath,
    rewrite: createMaskingRewrite(),
    trailingSlash: 'never',
    routeTree,
    routeMasks: [photoModalMask],
  })
}

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
