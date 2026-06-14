import { createMemoryHistory, createRouter } from '@tanstack/solid-router'
import {
  initialProductsSearch,
  parseJsonSearch,
  stringifyJsonSearch,
} from '../../shared'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [
        `/shop/products${stringifyJsonSearch(initialProductsSearch)}`,
      ],
    }),
    parseSearch: parseJsonSearch,
    stringifySearch: stringifyJsonSearch,
    search: { strict: true },
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
