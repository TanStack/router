import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import {
  SCROLL_CONTAINER_IDS,
  SCROLL_START_PATH,
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
    scrollToTopSelectors: [
      `[data-scroll-restoration-id="${SCROLL_CONTAINER_IDS.resetPanel}"]`,
      `[data-scroll-restoration-id="${SCROLL_CONTAINER_IDS.list}"]`,
      () =>
        document.querySelector(
          `[data-scroll-restoration-id="${SCROLL_CONTAINER_IDS.detail}"]`,
        ),
    ],
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
