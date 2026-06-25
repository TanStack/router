import { createMemoryHistory, createRouter } from '@tanstack/vue-router'
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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
