import { createRouter } from '@tanstack/react-router'
import { ProfileLinks } from './profile-links'
import { routeTree } from './routeTree.gen'
import type { ProductsApi } from '@route-modules/products/api'

export function createAppRouter(
  productsApi: ProductsApi,
  onProfileMatch?: (routeId: string | undefined) => void,
) {
  return createRouter({
    routeTree,
    context: { productsApi, onProfileMatch, profileLinks: ProfileLinks },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
