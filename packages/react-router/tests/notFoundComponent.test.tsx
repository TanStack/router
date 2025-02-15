import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  Link,
  Outlet,
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
  function StartComponent() {
    return <Link to={href}>{startTextLinkName}</Link>
  }
  StartComponent.startTextLinkName = startTextLinkName
  StartComponent.linkScreenElement = () => screen.findByText(startTextLinkName)
  return StartComponent
}
const getNotFoundComponent = (text: string) => {
  function NotFoundComponent() {
    return <div>{text}</div>
  }
  NotFoundComponent.notFoundTextName = text
  NotFoundComponent.screenElement = () => screen.findByText(text)
  return NotFoundComponent
}
const getRootComponent = () => {
  const rootTextName = 'RootComponent'
  function RootComponent() {
    return (
      <>
        <div>{rootTextName}</div>
        <Outlet />
      </>
    )
  }
  RootComponent.rootTextName = rootTextName
  RootComponent.screenElement = () => screen.findByText(rootTextName)
  return RootComponent
}

describe('notFoundComp rendered when notFound thrown in beforeLoad', () => {
  test('blank notFound in sync fn', async () => {
    const RootComponent = getRootComponent()
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const rootRoute = createRootRoute({
      component: RootComponent,
      notFoundComponent: NotFoundComponent,
    })

    const IndexComponent = getStartComponent(
      '/sync-before-load-throws-empty-not-found',
    )
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
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

    // setup
    const link = await IndexComponent.linkScreenElement()
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    // actual assertions
    const notFoundText = await NotFoundComponent.screenElement()
    expect(notFoundText).toBeInTheDocument()

    const rootText = await RootComponent.screenElement()
    expect(rootText).toBeInTheDocument()
  })

  test('blank notFound in async fn', async () => {
    const RootComponent = getRootComponent()
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const rootRoute = createRootRoute({
      component: RootComponent,
      notFoundComponent: NotFoundComponent,
    })

    const IndexComponent = getStartComponent(
      '/async-before-load-throws-empty-not-found',
    )
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
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

    // setup
    const link = await IndexComponent.linkScreenElement()
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    // actual assertions
    const notFoundText = await NotFoundComponent.screenElement()
    expect(notFoundText).toBeInTheDocument()

    const rootText = await RootComponent.screenElement()
    expect(rootText).toBeInTheDocument()
  })
})

describe('notFoundComp rendered when notFound thrown in loader', () => {
  /**
   * This test is currently rendering the DefaultGlobalNotFound component.
   * This probably shouldn't be happening, since we haven't configured it.
   */
  test('blank notFound in sync fn', async () => {
    const RootComponent = getRootComponent()
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const rootRoute = createRootRoute({
      component: RootComponent,
      notFoundComponent: NotFoundComponent,
    })

    const IndexComponent = getStartComponent(
      '/sync-loader-throws-empty-not-found',
    )
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
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

    // setup
    const link = await IndexComponent.linkScreenElement()
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    // actual assertions
    const notFoundText = await NotFoundComponent.screenElement()
    expect(notFoundText).toBeInTheDocument()

    const rootText = await RootComponent.screenElement()
    expect(rootText).toBeInTheDocument()
  })

  test('blank notFound in async fn', async () => {
    const RootComponent = getRootComponent()
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const rootRoute = createRootRoute({
      component: RootComponent,
      notFoundComponent: NotFoundComponent,
    })

    const IndexComponent = getStartComponent(
      '/async-loader-throws-empty-not-found',
    )
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
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

    // setup
    const link = await IndexComponent.linkScreenElement()
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    // actual assertions
    const notFoundText = await NotFoundComponent.screenElement()
    expect(notFoundText).toBeInTheDocument()

    const rootText = await RootComponent.screenElement()
    expect(rootText).toBeInTheDocument()
  })
})

describe('route does not exist', () => {
  test('navigate from the index route to expect a notFoundComponent', async () => {
    const RootComponent = getRootComponent()
    const NotFoundComponent = getNotFoundComponent('Not Found root')
    const rootRoute = createRootRoute({
      component: RootComponent,
      notFoundComponent: NotFoundComponent,
    })
    const IndexComponent = getStartComponent('/route-does-not-exist')
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({ routeTree, notFoundMode: 'fuzzy' })
    render(<RouterProvider router={router} />)

    // setup
    const link = await IndexComponent.linkScreenElement()
    expect(link).toBeInTheDocument()
    fireEvent.click(link)

    // actual assertions
    const notFoundText = await NotFoundComponent.screenElement()
    expect(notFoundText).toBeInTheDocument()

    const rootText = await RootComponent.screenElement()
    expect(rootText).toBeInTheDocument()
  })
})
