import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import {
  SCROLL_START_PATH,
  createScrollToTopSelectors,
  getScrollRestorationKey,
} from '../../shared.ts'
import { routeTree } from './routeTree'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [SCROLL_START_PATH],
    }),
    scrollRestoration: true,
    getScrollRestorationKey,
    scrollToTopSelectors: createScrollToTopSelectors(),
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
