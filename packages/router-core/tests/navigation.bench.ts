import { bench, describe } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { z } from 'zod'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

// ============================================================================
// Router with Zod search validation (realistic scenario)
// ============================================================================
function createRouter() {
  const rootRoute = new BaseRootRoute({})

  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const usersRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/users',
    validateSearch: z.object({
      filter: z.enum(['active', 'inactive', 'all']).optional(),
      sort: z.enum(['name', 'date', 'email']).optional(),
      page: z.number().optional(),
    }),
  })

  const userRoute = new BaseRoute({
    getParentRoute: () => usersRoute,
    path: '/$userId',
  })

  const userSettingsRoute = new BaseRoute({
    getParentRoute: () => userRoute,
    path: '/settings',
    validateSearch: z.object({
      tab: z.enum(['general', 'security', 'notifications']).optional(),
    }),
  })

  const productsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/products',
    validateSearch: z.object({
      category: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
      inStock: z.boolean().optional(),
    }),
  })

  const productRoute = new BaseRoute({
    getParentRoute: () => productsRoute,
    path: '/$productId',
  })

  const productReviewsRoute = new BaseRoute({
    getParentRoute: () => productRoute,
    path: '/reviews',
    validateSearch: z.object({
      rating: z.number().optional(),
      verified: z.boolean().optional(),
    }),
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    usersRoute.addChildren([userRoute.addChildren([userSettingsRoute])]),
    productsRoute.addChildren([
      productRoute.addChildren([productReviewsRoute]),
    ]),
  ])

  return new RouterCore({
    routeTree,
    history: createMemoryHistory(),
  })
}

// ============================================================================
// Real Navigation Benchmarks - Tests actual navigate() calls
// ============================================================================

describe('Navigation: search param updates (same route)', () => {
  bench('update page number 1000x', async () => {
    const router = createRouter()
    await router.load()

    // Navigate to users route first
    await router.navigate({
      to: '/users',
      search: { filter: 'active', sort: 'name', page: 1 },
    })

    // Update page param repeatedly
    for (let i = 0; i < 1000; i++) {
      await router.navigate({
        to: '/users',
        search: { filter: 'active', sort: 'name', page: i % 100 },
      })
    }
  })

  bench('toggle filter param 1000x', async () => {
    const router = createRouter()
    await router.load()

    await router.navigate({
      to: '/users',
      search: { filter: 'active', sort: 'name', page: 1 },
    })

    const filters = ['active', 'inactive', 'all'] as const
    for (let i = 0; i < 1000; i++) {
      await router.navigate({
        to: '/users',
        search: { filter: filters[i % 3], sort: 'name', page: 1 },
      })
    }
  })
})

describe('Navigation: route changes with params', () => {
  bench('navigate between user profiles 1000x', async () => {
    const router = createRouter()
    await router.load()

    for (let i = 0; i < 1000; i++) {
      await router.navigate({
        to: '/users/$userId/settings',
        params: { userId: `user-${i % 100}` },
        search: { tab: 'security' },
      })
    }
  })

  bench('navigate between products 1000x', async () => {
    const router = createRouter()
    await router.load()

    for (let i = 0; i < 1000; i++) {
      await router.navigate({
        to: '/products/$productId/reviews',
        params: { productId: `prod-${i % 100}` },
        search: { rating: (i % 5) + 1, verified: i % 2 === 0 },
      })
    }
  })
})

describe('Navigation: mixed navigation patterns', () => {
  bench('alternating routes 1000x', async () => {
    const router = createRouter()
    await router.load()

    for (let i = 0; i < 1000; i++) {
      if (i % 2 === 0) {
        await router.navigate({
          to: '/users/$userId/settings',
          params: { userId: `user-${i}` },
          search: { tab: 'general' },
        })
      } else {
        await router.navigate({
          to: '/products/$productId/reviews',
          params: { productId: `prod-${i}` },
          search: { rating: 5, verified: true },
        })
      }
    }
  })

  bench('deep to shallow navigation 1000x', async () => {
    const router = createRouter()
    await router.load()

    for (let i = 0; i < 1000; i++) {
      if (i % 2 === 0) {
        // Deep route
        await router.navigate({
          to: '/users/$userId/settings',
          params: { userId: `user-${i}` },
          search: { tab: 'security' },
        })
      } else {
        // Shallow route
        await router.navigate({
          to: '/',
        })
      }
    }
  })
})

describe('Navigation: back/forward simulation', () => {
  bench('push 500 then back 500', async () => {
    const router = createRouter()
    await router.load()

    // Push 500 navigations
    for (let i = 0; i < 500; i++) {
      await router.navigate({
        to: '/users/$userId/settings',
        params: { userId: `user-${i}` },
        search: { tab: i % 2 === 0 ? 'general' : 'security' },
      })
    }

    // Go back 500 times
    for (let i = 0; i < 500; i++) {
      router.history.back()
      // Wait for history to settle
      await new Promise((r) => setTimeout(r, 0))
    }
  })
})
