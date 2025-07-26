import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'

import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
  useSearch,
} from '../src'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  vi.resetAllMocks()
  cleanup()
})

describe('Basic Search Parameters How-To Guide', () => {
  describe('Quick Start Example', () => {
    it('should validate and read basic search parameters', async () => {
      const ProductsPage = () => {
        const { page, category, showSale } = productsRoute.useSearch()
        
        return (
          <div>
            <h1>Products</h1>
            <div data-testid="page">Page: {page}</div>
            <div data-testid="category">Category: {category}</div>
            <div data-testid="show-sale">Show Sale Items: {showSale ? 'Yes' : 'No'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const productsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/products',
        validateSearch: (search: Record<string, unknown>) => ({
          page: Number(search.page) || 1,
          category: (search.category as string) || 'all',
          showSale: Boolean(search.showSale),
        }),
        component: ProductsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([productsRoute]),
        history,
      })

      // Test with search parameters in URL
      window.history.replaceState(null, '', '/products?page=3&category=electronics&showSale=true')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('Page: 3')
      expect(await screen.findByTestId('category')).toHaveTextContent('Category: electronics')
      expect(await screen.findByTestId('show-sale')).toHaveTextContent('Show Sale Items: Yes')
    })

    it('should use default values when search parameters are missing', async () => {
      const ProductsPage = () => {
        const { page, category, showSale } = productsRoute.useSearch()
        
        return (
          <div>
            <div data-testid="page">{page}</div>
            <div data-testid="category">{category}</div>
            <div data-testid="show-sale">{showSale ? 'Yes' : 'No'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const productsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/products',
        validateSearch: (search: Record<string, unknown>) => ({
          page: Number(search.page) || 1,
          category: (search.category as string) || 'all',
          showSale: Boolean(search.showSale),
        }),
        component: ProductsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([productsRoute]),
        history,
      })

      // Test without search parameters
      window.history.replaceState(null, '', '/products')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('1')
      expect(await screen.findByTestId('category')).toHaveTextContent('all')
      expect(await screen.findByTestId('show-sale')).toHaveTextContent('No')
    })
  })

  describe('Data Type Handling', () => {
    it('should handle different data types correctly', async () => {
      const DashboardPage = () => {
        const search = dashboardRoute.useSearch()
        
        return (
          <div>
            <div data-testid="user-id">User ID: {search.userId}</div>
            <div data-testid="refresh-interval">Refresh: {search.refreshInterval}</div>
            <div data-testid="theme">Theme: {search.theme}</div>
            <div data-testid="timezone">Timezone: {search.timezone || 'none'}</div>
            <div data-testid="auto-refresh">Auto Refresh: {search.autoRefresh ? 'Yes' : 'No'}</div>
            <div data-testid="debug-mode">Debug: {search.debugMode ? 'Yes' : 'No'}</div>
            <div data-testid="selected-ids">Selected IDs: {search.selectedIds.join(',')}</div>
            <div data-testid="filters">Filters: {JSON.stringify(search.filters)}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const dashboardRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/dashboard',
        validateSearch: (search: Record<string, unknown>) => ({
          // Numbers
          userId: Number(search.userId) || 0,
          refreshInterval: Number(search.refreshInterval) || 5000,
          
          // Strings
          theme: (search.theme as string) || 'light',
          timezone: search.timezone as string | undefined,
          
          // Booleans
          autoRefresh: Boolean(search.autoRefresh),
          debugMode: Boolean(search.debugMode),
          
          // Arrays (parsed from JSON)
          selectedIds: Array.isArray(search.selectedIds) 
            ? search.selectedIds.map(Number) 
            : [],
            
          // Objects (parsed from JSON)
          filters: typeof search.filters === 'object' && search.filters !== null
            ? search.filters as Record<string, string>
            : {},
        }),
        component: DashboardPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([dashboardRoute]),
        history,
      })

      // Test with complex search parameters
      const searchParams = new URLSearchParams({
        userId: '123',
        refreshInterval: '10000',
        theme: 'dark',
        timezone: 'America/New_York',
        autoRefresh: 'true',
        debugMode: 'true',
        selectedIds: JSON.stringify([1, 2, 3]),
        filters: JSON.stringify({ status: 'active', type: 'premium' }),
      })
      
      window.history.replaceState(null, '', `/dashboard?${searchParams.toString()}`)
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('user-id')).toHaveTextContent('User ID: 123')
      expect(await screen.findByTestId('refresh-interval')).toHaveTextContent('Refresh: 10000')
      expect(await screen.findByTestId('theme')).toHaveTextContent('Theme: dark')
      expect(await screen.findByTestId('timezone')).toHaveTextContent('Timezone: America/New_York')
      expect(await screen.findByTestId('auto-refresh')).toHaveTextContent('Auto Refresh: Yes')
      expect(await screen.findByTestId('debug-mode')).toHaveTextContent('Debug: Yes')
      expect(await screen.findByTestId('selected-ids')).toHaveTextContent('Selected IDs: 1,2,3')
      expect(await screen.findByTestId('filters')).toHaveTextContent('Filters: {"status":"active","type":"premium"}')
    })
  })

  describe('Pagination Pattern', () => {
    it('should handle pagination parameters with constraints', async () => {
      const PostsPage = () => {
        const { page, limit } = postsRoute.useSearch()
        const offset = (page - 1) * limit
        
        return (
          <div>
            <div data-testid="page">Page {page}</div>
            <div data-testid="limit">{limit} posts per page</div>
            <div data-testid="offset">Offset: {offset}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
        validateSearch: (search: Record<string, unknown>) => ({
          page: Math.max(1, Number(search.page) || 1),
          limit: Math.min(100, Math.max(10, Number(search.limit) || 20)),
        }),
        component: PostsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      // Test with valid pagination
      window.history.replaceState(null, '', '/posts?page=3&limit=50')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('Page 3')
      expect(await screen.findByTestId('limit')).toHaveTextContent('50 posts per page')
      expect(await screen.findByTestId('offset')).toHaveTextContent('Offset: 100')
    })

    it('should enforce pagination constraints', async () => {
      const PostsPage = () => {
        const { page, limit } = postsRoute.useSearch()
        
        return (
          <div>
            <div data-testid="page">{page}</div>
            <div data-testid="limit">{limit}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
        validateSearch: (search: Record<string, unknown>) => ({
          page: Math.max(1, Number(search.page) || 1),
          limit: Math.min(100, Math.max(10, Number(search.limit) || 20)),
        }),
        component: PostsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      // Test with invalid pagination (page 0, limit too high)
      window.history.replaceState(null, '', '/posts?page=0&limit=500')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('1') // Constrained to minimum 1
      expect(await screen.findByTestId('limit')).toHaveTextContent('100') // Constrained to maximum 100
    })
  })

  describe('Enum Validation Pattern', () => {
    it('should validate enum values and provide defaults', async () => {
      type SortOption = 'name' | 'date' | 'price'
      type CategoryOption = 'electronics' | 'clothing' | 'books' | 'all'

      const CatalogPage = () => {
        const { sort, category, ascending } = catalogRoute.useSearch()
        
        return (
          <div>
            <div data-testid="sort">{sort}</div>
            <div data-testid="category">{category}</div>
            <div data-testid="ascending">{ascending ? 'Ascending' : 'Descending'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const catalogRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/catalog',
        validateSearch: (search: Record<string, unknown>) => {
          const validSorts: SortOption[] = ['name', 'date', 'price']
          const validCategories: CategoryOption[] = ['electronics', 'clothing', 'books', 'all']
          
          return {
            sort: validSorts.includes(search.sort as SortOption) 
              ? (search.sort as SortOption) 
              : 'name',
            category: validCategories.includes(search.category as CategoryOption)
              ? (search.category as CategoryOption)
              : 'all',
            ascending: search.ascending === false ? false : true, // Default to true
          }
        },
        component: CatalogPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([catalogRoute]),
        history,
      })

      // Test with valid enum values
      window.history.replaceState(null, '', '/catalog?sort=price&category=electronics&ascending=false')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('sort')).toHaveTextContent('price')
      expect(await screen.findByTestId('category')).toHaveTextContent('electronics')
      expect(await screen.findByTestId('ascending')).toHaveTextContent('Descending')
    })

    it('should fallback to defaults for invalid enum values', async () => {
      type SortOption = 'name' | 'date' | 'price'
      type CategoryOption = 'electronics' | 'clothing' | 'books' | 'all'

      const CatalogPage = () => {
        const { sort, category, ascending } = catalogRoute.useSearch()
        
        return (
          <div>
            <div data-testid="sort">{sort}</div>
            <div data-testid="category">{category}</div>
            <div data-testid="ascending">{ascending ? 'Ascending' : 'Descending'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const catalogRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/catalog',
        validateSearch: (search: Record<string, unknown>) => {
          const validSorts: SortOption[] = ['name', 'date', 'price']
          const validCategories: CategoryOption[] = ['electronics', 'clothing', 'books', 'all']
          
          return {
            sort: validSorts.includes(search.sort as SortOption) 
              ? (search.sort as SortOption) 
              : 'name',
            category: validCategories.includes(search.category as CategoryOption)
              ? (search.category as CategoryOption)
              : 'all',
            ascending: search.ascending === false ? false : true, // Default to true
          }
        },
        component: CatalogPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([catalogRoute]),
        history,
      })

      // Test with invalid enum values
      window.history.replaceState(null, '', '/catalog?sort=invalid&category=unknown')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('sort')).toHaveTextContent('name') // Default value
      expect(await screen.findByTestId('category')).toHaveTextContent('all') // Default value
      expect(await screen.findByTestId('ascending')).toHaveTextContent('Ascending') // Default true
    })
  })

  describe('getRouteApi Usage', () => {
    it('should access search parameters using getRouteApi', async () => {
      const ProductFilters = () => {
        const routeApi = getRouteApi('/products')
        const { category, sort } = routeApi.useSearch()
        
        return (
          <div>
            <div data-testid="category-filter">{category}</div>
            <div data-testid="sort-filter">{sort}</div>
          </div>
        )
      }

      const ProductsPage = () => {
        return (
          <div>
            <h1>Products</h1>
            <ProductFilters />
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const productsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/products',
        validateSearch: (search: Record<string, unknown>) => ({
          category: (search.category as string) || 'all',
          sort: (search.sort as string) || 'name',
        }),
        component: ProductsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([productsRoute]),
        history,
      })

      window.history.replaceState(null, '', '/products?category=electronics&sort=price')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('category-filter')).toHaveTextContent('electronics')
      expect(await screen.findByTestId('sort-filter')).toHaveTextContent('price')
    })
  })

  describe('useSearch with from parameter', () => {
    it('should access search parameters using useSearch with from', async () => {
      const GenericSearchDisplay = () => {
        const search = useSearch({ from: '/products' })
        
        return (
          <div>
            <div data-testid="search-display">{JSON.stringify(search)}</div>
          </div>
        )
      }

      const ProductsPage = () => {
        return (
          <div>
            <h1>Products</h1>
            <GenericSearchDisplay />
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const productsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/products',
        validateSearch: (search: Record<string, unknown>) => ({
          category: (search.category as string) || 'all',
          page: Number(search.page) || 1,
        }),
        component: ProductsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([productsRoute]),
        history,
      })

      window.history.replaceState(null, '', '/products?category=electronics&page=2')
      await router.load()

      render(<RouterProvider router={router} />)

      const searchDisplay = await screen.findByTestId('search-display')
      const searchValue = JSON.parse(searchDisplay.textContent!)
      expect(searchValue).toEqual({ category: 'electronics', page: 2 })
    })
  })

  describe('Boolean Handling Edge Cases', () => {
    it('should handle different boolean patterns correctly', async () => {
      const TestPage = () => {
        const search = testRoute.useSearch()
        
        return (
          <div>
            <div data-testid="explicit-flag">{search.explicitFlag ? 'true' : 'false'}</div>
            <div data-testid="presence-flag">{search.presenceFlag ? 'true' : 'false'}</div>
            <div data-testid="safe-boolean-flag">{search.safeBooleanFlag ? 'true' : 'false'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const testRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/test',
        validateSearch: (search: Record<string, unknown>) => ({
          // For ?flag=true or ?flag=false (TanStack Router auto-converts to boolean)
          explicitFlag: Boolean(search.explicitFlag),
          
          // For ?flag (presence = true, absence = false) - presence gives empty string
          presenceFlag: search.presenceFlag === '' || search.presenceFlag === true,
          
          // TanStack Router already converts string "true"/"false" to booleans
          safeBooleanFlag: Boolean(search.safeBooleanFlag),
        }),
        component: TestPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([testRoute]),
        history,
      })

      // Test with presence-based flag and explicit values
      window.history.replaceState(null, '', '/test?explicitFlag=true&presenceFlag&safeBooleanFlag=true')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('explicit-flag')).toHaveTextContent('true')
      expect(await screen.findByTestId('presence-flag')).toHaveTextContent('true')
      expect(await screen.findByTestId('safe-boolean-flag')).toHaveTextContent('true')
    })

    it('should handle false boolean values correctly', async () => {
      const TestPage = () => {
        const search = testRoute.useSearch()
        
        return (
          <div>
            <div data-testid="explicit-flag">{search.explicitFlag ? 'true' : 'false'}</div>
            <div data-testid="presence-flag">{search.presenceFlag ? 'true' : 'false'}</div>
            <div data-testid="safe-boolean-flag">{search.safeBooleanFlag ? 'true' : 'false'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const testRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/test',
        validateSearch: (search: Record<string, unknown>) => ({
          // For ?flag=true or ?flag=false (TanStack Router auto-converts to boolean)
          explicitFlag: Boolean(search.explicitFlag),
          
          // For ?flag (presence = true, absence = false) - presence gives empty string
          presenceFlag: search.presenceFlag === '' || search.presenceFlag === true,
          
          // TanStack Router already converts string "true"/"false" to booleans
          safeBooleanFlag: Boolean(search.safeBooleanFlag),
        }),
        component: TestPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([testRoute]),
        history,
      })

      // Test with explicit false and no presence flag
      window.history.replaceState(null, '', '/test?explicitFlag=false&safeBooleanFlag=false')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('explicit-flag')).toHaveTextContent('false')
      expect(await screen.findByTestId('presence-flag')).toHaveTextContent('false') // Not present
      expect(await screen.findByTestId('safe-boolean-flag')).toHaveTextContent('false')
    })
  })

  describe('TypeScript Support', () => {
    it('should support explicit typing of validateSearch return type', async () => {
      type ProductSearch = {
        page: number
        category: string
        showSale: boolean
      }

      const ProductsPage = () => {
        const search = productsRoute.useSearch()
        
        return (
          <div>
            <div data-testid="page">{search.page}</div>
            <div data-testid="category">{search.category}</div>
            <div data-testid="show-sale">{search.showSale ? 'Yes' : 'No'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const productsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/products',
        validateSearch: (search: Record<string, unknown>): ProductSearch => ({
          page: Number(search.page) || 1,
          category: (search.category as string) || 'all',
          showSale: Boolean(search.showSale),
        }),
        component: ProductsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([productsRoute]),
        history,
      })

      window.history.replaceState(null, '', '/products?page=2&category=electronics&showSale=true')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('2')
      expect(await screen.findByTestId('category')).toHaveTextContent('electronics')
      expect(await screen.findByTestId('show-sale')).toHaveTextContent('Yes')
    })
  })
})