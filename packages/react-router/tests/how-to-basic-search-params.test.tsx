import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { z } from 'zod'

import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
  useSearch,
} from '../src'
import { zodValidator, fallback } from '@tanstack/zod-adapter'
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
  describe('Zod Validation (Production Approach)', () => {
    it('should validate and read basic search parameters with Zod', async () => {
      const productSearchSchema = z.object({
        page: fallback(z.number(), 1).default(1),
        category: fallback(z.string(), 'all').default('all'),
        showSale: fallback(z.boolean(), false).default(false),
      })

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
        validateSearch: zodValidator(productSearchSchema),
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

    it('should use fallback values for invalid parameters', async () => {
      const productSearchSchema = z.object({
        page: fallback(z.number(), 1).default(1),
        category: fallback(z.string(), 'all').default('all'),
        showSale: fallback(z.boolean(), false).default(false),
      })

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
        validateSearch: zodValidator(productSearchSchema),
        component: ProductsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([productsRoute]),
        history,
      })

      // Test with invalid parameters (should fallback to defaults)
      window.history.replaceState(null, '', '/products?page=invalid&category=unknown&showSale=invalid')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('1') // Fallback
      expect(await screen.findByTestId('category')).toHaveTextContent('all') // Fallback  
      expect(await screen.findByTestId('show-sale')).toHaveTextContent('No') // Fallback
    })
  })

  describe('Pagination with Constraints', () => {
    it('should handle pagination parameters with validation', async () => {
      const paginationSchema = z.object({
        page: fallback(z.number().min(1), 1).default(1),
        limit: fallback(z.number().min(10).max(100), 20).default(20),
      })

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
        validateSearch: zodValidator(paginationSchema),
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

    it('should enforce pagination constraints with fallbacks', async () => {
      const paginationSchema = z.object({
        page: fallback(z.number().min(1), 1).default(1),
        limit: fallback(z.number().min(10).max(100), 20).default(20),
      })

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
        validateSearch: zodValidator(paginationSchema),
        component: PostsPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      // Test with constraint violations (page 0, limit too high)
      window.history.replaceState(null, '', '/posts?page=0&limit=500')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('1') // Fallback to default
      expect(await screen.findByTestId('limit')).toHaveTextContent('20') // Fallback to default
    })
  })

  describe('Enum Validation', () => {
    it('should validate enum values with Zod', async () => {
      const catalogSchema = z.object({
        sort: fallback(z.enum(['name', 'date', 'price']), 'name').default('name'),
        category: fallback(z.enum(['electronics', 'clothing', 'books', 'all']), 'all').default('all'),
        ascending: fallback(z.boolean(), true).default(true),
      })

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
        validateSearch: zodValidator(catalogSchema),
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
      const catalogSchema = z.object({
        sort: fallback(z.enum(['name', 'date', 'price']), 'name').default('name'),
        category: fallback(z.enum(['electronics', 'clothing', 'books', 'all']), 'all').default('all'),
        ascending: fallback(z.boolean(), true).default(true),
      })

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
        validateSearch: zodValidator(catalogSchema),
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

  describe('Complex Data Types with Zod', () => {
    it('should handle arrays and objects with validation', async () => {
      const complexSchema = z.object({
        selectedIds: fallback(z.number().array(), []).default([]),
        tags: fallback(z.string().array(), []).default([]),
        filters: fallback(
          z.object({
            status: z.enum(['active', 'inactive']).optional(),
            type: z.string().optional(),
          }),
          {}
        ).default({}),
      })

      const ComplexPage = () => {
        const search = complexRoute.useSearch()
        
        return (
          <div>
            <div data-testid="selected-ids">Selected IDs: {search.selectedIds.join(',')}</div>
            <div data-testid="tags">Tags: {search.tags.join(',')}</div>
            <div data-testid="filters">Filters: {JSON.stringify(search.filters)}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const complexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/complex',
        validateSearch: zodValidator(complexSchema),
        component: ComplexPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([complexRoute]),
        history,
      })

      // Test with complex search parameters
      const searchParams = new URLSearchParams({
        selectedIds: JSON.stringify([1, 2, 3]),
        tags: JSON.stringify(['urgent', 'review']),
        filters: JSON.stringify({ status: 'active', type: 'premium' }),
      })
      
      window.history.replaceState(null, '', `/complex?${searchParams.toString()}`)
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('selected-ids')).toHaveTextContent('Selected IDs: 1,2,3')
      expect(await screen.findByTestId('tags')).toHaveTextContent('Tags: urgent,review')
      expect(await screen.findByTestId('filters')).toHaveTextContent('Filters: {"status":"active","type":"premium"}')
    })
  })

  describe('Optional Parameters', () => {
    it('should handle optional parameters correctly', async () => {
      const optionalSchema = z.object({
        page: fallback(z.number(), 1).default(1),
        searchTerm: z.string().optional(),
        category: fallback(z.string(), 'all').default('all'),
      })

      const OptionalPage = () => {
        const { page, searchTerm, category } = optionalRoute.useSearch()
        
        return (
          <div>
            <div data-testid="page">{page}</div>
            <div data-testid="search-term">{searchTerm || 'No search term'}</div>
            <div data-testid="category">{category}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const optionalRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/optional',
        validateSearch: zodValidator(optionalSchema),
        component: OptionalPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([optionalRoute]),
        history,
      })

      // Test with only some parameters
      window.history.replaceState(null, '', '/optional?page=2&searchTerm=test')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('2')
      expect(await screen.findByTestId('search-term')).toHaveTextContent('test')
      expect(await screen.findByTestId('category')).toHaveTextContent('all') // Default
    })
  })

  describe('getRouteApi Usage', () => {
    it('should access search parameters using getRouteApi', async () => {
      const searchSchema = z.object({
        category: fallback(z.string(), 'all').default('all'),
        sort: fallback(z.string(), 'name').default('name'),
      })

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
        validateSearch: zodValidator(searchSchema),
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

  describe('Manual Validation (Educational)', () => {
    it('should demonstrate manual validation for learning purposes', async () => {
      const ManualPage = () => {
        const { page, category, showSale } = manualRoute.useSearch()
        
        return (
          <div>
            <div data-testid="page">{page}</div>
            <div data-testid="category">{category}</div>
            <div data-testid="show-sale">{showSale ? 'Yes' : 'No'}</div>
          </div>
        )
      }

      const rootRoute = createRootRoute()
      const manualRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/manual',
        validateSearch: (search: Record<string, unknown>) => ({
          // Numbers need coercion from URL strings
          page: Number(search.page) || 1,
          
          // Strings can be cast with defaults
          category: (search.category as string) || 'all',
          
          // Booleans: TanStack Router auto-converts "true"/"false" to booleans
          showSale: Boolean(search.showSale),
        }),
        component: ManualPage,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([manualRoute]),
        history,
      })

      window.history.replaceState(null, '', '/manual?page=2&category=electronics&showSale=true')
      await router.load()

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('page')).toHaveTextContent('2')
      expect(await screen.findByTestId('category')).toHaveTextContent('electronics')
      expect(await screen.findByTestId('show-sale')).toHaveTextContent('Yes')
    })
  })
})