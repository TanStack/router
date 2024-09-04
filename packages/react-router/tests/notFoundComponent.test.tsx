import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const getStartComponent = (href: string) => {
  const startTextLinkName = 'Link to test'
  function RouteComponent() {
    return <Link to={href}>{startTextLinkName}</Link>
  }
  RouteComponent.startTextLinkName = startTextLinkName
  return RouteComponent
}
const getNotFoundComponent = (text: string) => {
  function NotFoundComponent() {
    return <div>{text}</div>
  }
  NotFoundComponent.notFoundTextName = text
  return NotFoundComponent
}

describe('notFoundComp rendered when notFound thrown in beforeLoad', () => {
  test('blank notFound in sync fn', async () => {
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const Component = getStartComponent(
      '/sync-before-load-throws-empty-not-found',
    )
    const rootRoute = createRootRoute({ notFoundComponent: NotFoundComponent })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Component,
    })
    const syncBeforeLoadThrowsEmptyNotFound = createRoute({
      getParentRoute: () => rootRoute,
      path: '/sync-before-load-throws-empty-not-found',
      beforeLoad: () => {
        throw notFound()
      },
    })
    const routeTree = rootRoute.addChildren([
      syncBeforeLoadThrowsEmptyNotFound,
      indexRoute,
    ])
    const router = createRouter({ routeTree, notFoundMode: 'fuzzy' })
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', {
      name: Component.startTextLinkName,
    })
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    const notFoundText = await screen.findByText(
      NotFoundComponent.notFoundTextName,
    )
    expect(notFoundText).toBeInTheDocument()
  })

  test('blank notFound in async fn', async () => {
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const Component = getStartComponent(
      '/async-before-load-throws-empty-not-found',
    )
    const rootRoute = createRootRoute({ notFoundComponent: NotFoundComponent })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Component,
    })
    const asyncBeforeLoadThrowsEmptyNotFound = createRoute({
      getParentRoute: () => rootRoute,
      path: '/async-before-load-throws-empty-not-found',
      beforeLoad: async () => {
        await sleep(1)
        throw notFound()
      },
    })
    const routeTree = rootRoute.addChildren([
      asyncBeforeLoadThrowsEmptyNotFound,
      indexRoute,
    ])
    const router = createRouter({ routeTree, notFoundMode: 'fuzzy' })
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', {
      name: Component.startTextLinkName,
    })
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    const notFoundText = await screen.findByText(
      NotFoundComponent.notFoundTextName,
    )
    expect(notFoundText).toBeInTheDocument()
  })
})

describe('notFoundComp rendered when notFound thrown in loader', () => {
  /**
   * This test is currently rendering the DefaultGlobalNotFound component.
   * This probably shouldn't be happening, since we haven't configured it.
   */
  test('blank notFound in sync fn', async () => {
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const Component = getStartComponent('/sync-loader-throws-empty-not-found')
    const rootRoute = createRootRoute({ notFoundComponent: NotFoundComponent })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Component,
    })
    const syncLoaderThrowsEmptyNotFound = createRoute({
      getParentRoute: () => rootRoute,
      path: '/sync-loader-throws-empty-not-found',
      loader: () => {
        throw notFound()
      },
    })
    const routeTree = rootRoute.addChildren([
      syncLoaderThrowsEmptyNotFound,
      indexRoute,
    ])
    const router = createRouter({ routeTree, notFoundMode: 'fuzzy' })
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', {
      name: Component.startTextLinkName,
    })
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    const notFoundText = await screen.findByText(
      NotFoundComponent.notFoundTextName,
    )
    expect(notFoundText).toBeInTheDocument()
  })

  test('blank notFound in async fn', async () => {
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const Component = getStartComponent('/async-loader-throws-empty-not-found')
    const rootRoute = createRootRoute({ notFoundComponent: NotFoundComponent })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Component,
    })
    const asyncLoaderThrowsEmptyNotFound = createRoute({
      getParentRoute: () => rootRoute,
      path: '/async-loader-throws-empty-not-found',
      loader: async () => {
        await sleep(1)
        throw notFound()
      },
    })
    const routeTree = rootRoute.addChildren([
      asyncLoaderThrowsEmptyNotFound,
      indexRoute,
    ])
    const router = createRouter({ routeTree, notFoundMode: 'fuzzy' })
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', {
      name: Component.startTextLinkName,
    })
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    const notFoundText = await screen.findByText(
      NotFoundComponent.notFoundTextName,
    )
    expect(notFoundText).toBeInTheDocument()
  })
})

describe('route does not exist', () => {
  test('navigate from the index route to expect a notFoundComponent', async () => {
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const Component = getStartComponent('/route-does-not-exist')
    const rootRoute = createRootRoute({ notFoundComponent: NotFoundComponent })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Component,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, notFoundMode: 'fuzzy' })
    render(<RouterProvider router={router} />)

    const link = await screen.findByRole('link', {
      name: Component.startTextLinkName,
    })
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    const notFoundText = await screen.findByText(
      NotFoundComponent.notFoundTextName,
    )
    expect(notFoundText).toBeInTheDocument()
  })
})
