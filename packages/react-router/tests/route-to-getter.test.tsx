import { describe, expect, test } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

describe('Route.to getter early access', () => {
  test('Route.to should be accessible before Router initialization', () => {
    const rootRoute = createRootRoute({})
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
    })

    const menuItems = [{ label: 'About', to: aboutRoute.to }]

    expect(menuItems[0]?.to).toBe('/about')
    expect(aboutRoute.to).toBe('/about')

    const routeTree = rootRoute.addChildren([aboutRoute])
    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(aboutRoute.to).toBe('/about')
    expect(menuItems[0]?.to).toBe('/about')
  })

  test('Nested routes should resolve full path before initialization', () => {
    const rootRoute = createRootRoute({})
    const dashboardRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
    })
    const settingsRoute = createRoute({
      getParentRoute: () => dashboardRoute,
      path: '/settings',
    })
    const profileRoute = createRoute({
      getParentRoute: () => settingsRoute,
      path: '/profile',
    })

    expect(dashboardRoute.to).toBe('/dashboard')
    expect(settingsRoute.to).toBe('/dashboard/settings')
    expect(profileRoute.to).toBe('/dashboard/settings/profile')

    const routeTree = rootRoute.addChildren([
      dashboardRoute.addChildren([settingsRoute.addChildren([profileRoute])]),
    ])

    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(dashboardRoute.to).toBe('/dashboard')
    expect(settingsRoute.to).toBe('/dashboard/settings')
    expect(profileRoute.to).toBe('/dashboard/settings/profile')
  })

  test('Index routes should resolve correctly', () => {
    const rootRoute = createRootRoute({})
    const dashboardRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
    })
    const indexRoute = createRoute({
      getParentRoute: () => dashboardRoute,
      path: '/',
    })

    expect(indexRoute.to).toBe('/dashboard')

    const routeTree = rootRoute.addChildren([
      dashboardRoute.addChildren([indexRoute]),
    ])

    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(indexRoute.to).toBe('/dashboard/')
  })

  test('Dynamic routes should preserve parameters', () => {
    const rootRoute = createRootRoute({})
    const userRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/users/$userId',
    })
    const postRoute = createRoute({
      getParentRoute: () => userRoute,
      path: '/posts/$postId',
    })

    expect(userRoute.to).toBe('/users/$userId')
    expect(postRoute.to).toBe('/users/$userId/posts/$postId')

    const routeTree = rootRoute.addChildren([
      userRoute.addChildren([postRoute]),
    ])

    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(userRoute.to).toBe('/users/$userId')
    expect(postRoute.to).toBe('/users/$userId/posts/$postId')
  })

  test('Optional parameters should be preserved', () => {
    const rootRoute = createRootRoute({})
    const productRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/products/$category?/$productId?',
    })

    expect(productRoute.to).toBe('/products/$category?/$productId?')

    const routeTree = rootRoute.addChildren([productRoute])
    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(productRoute.to).toBe('/products/$category?/$productId?')
  })

  test('Wildcard routes should work correctly', () => {
    const rootRoute = createRootRoute({})
    const filesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/files/$',
    })

    expect(filesRoute.to).toBe('/files/$')

    const routeTree = rootRoute.addChildren([filesRoute])
    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(filesRoute.to).toBe('/files/$')
  })

  test('Static array pattern should capture correct values', () => {
    const rootRoute = createRootRoute({})
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
    })
    const contactRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/contact',
    })

    const navigation = [
      { label: 'Home', to: homeRoute.to },
      { label: 'About', to: aboutRoute.to },
      { label: 'Contact', to: contactRoute.to },
    ]

    expect(navigation[0]?.to).toBe('/')
    expect(navigation[1]?.to).toBe('/about')
    expect(navigation[2]?.to).toBe('/contact')

    const routeTree = rootRoute.addChildren([
      homeRoute,
      aboutRoute,
      contactRoute,
    ])

    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(navigation[0]?.to).toBe('/')
    expect(navigation[1]?.to).toBe('/about')
    expect(navigation[2]?.to).toBe('/contact')
  })

  test('Pathless parent routes should not affect child path', () => {
    const rootRoute = createRootRoute({})

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
    })

    const childRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/child',
    })

    expect(childRoute.to).toBe('/child')

    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([childRoute]),
    ])

    createRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    expect(childRoute.to).toBe('/child')
  })

  test('Root route should always return "/" for to getter', () => {
    const rootRoute = createRootRoute({})

    expect(rootRoute.to).toBe('/')

    createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory(),
    })

    expect(rootRoute.to).toBe('/')
  })
})
