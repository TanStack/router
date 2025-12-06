import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'

import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../src'
import type { NotFoundRouteProps, RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

test.each([
  {
    notFoundMode: 'fuzzy' as const,
    expectedNotFoundComponent: 'settings-not-found',
  },
  {
    notFoundMode: 'root' as const,
    expectedNotFoundComponent: 'root-not-found',
  },
])(
  'correct notFoundComponent is rendered for mode=%s',
  async ({ notFoundMode, expectedNotFoundComponent }) => {
    const rootRoute = createRootRoute({
      component: () => (
        <div data-testid="root-component">
          <h1>Root Component</h1>
          <div>
            <Link data-testid="settings-link" to="/settings/">
              link to settings
            </Link>{' '}
            <Link data-testid="non-existing-link" to="/settings/does-not-exist">
              link to non-existing route
            </Link>
          </div>
          <Outlet />
        </div>
      ),
      notFoundComponent: () => (
        <span data-testid="root-not-found">Root Not Found Component</span>
      ),
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div data-testid="index-component">
          <h2>Index Page</h2>
        </div>
      ),
    })

    const settingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings',
      notFoundComponent: () => (
        <span data-testid="settings-not-found">
          Settings Not Found Component
        </span>
      ),
      component: () => (
        <div>
          <p>Settings Page Layout</p>
          <Outlet />
        </div>
      ),
    })

    const settingsIndexRoute = createRoute({
      getParentRoute: () => settingsRoute,
      path: '/',
      component: () => (
        <div data-testid="settings-index-component">Settings Page</div>
      ),
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        settingsRoute.addChildren([settingsIndexRoute]),
      ]),
      history,
      notFoundMode,
    })

    render(<RouterProvider router={router} />)
    await router.load()
    await screen.findByTestId('root-component')

    const settingsLink = screen.getByTestId('settings-link')
    settingsLink.click()

    const settingsIndexComponent = await screen.findByTestId(
      'settings-index-component',
    )
    expect(settingsIndexComponent).toBeInTheDocument()

    const nonExistingLink = screen.getByTestId('non-existing-link')
    nonExistingLink.click()

    const notFoundComponent = await screen.findByTestId(
      expectedNotFoundComponent,
      {},
      { timeout: 1000 },
    )
    expect(notFoundComponent).toBeInTheDocument()
  },
)

test('defaultNotFoundComponent and notFoundComponent receives data props via spread operator', async () => {
  const isCustomData = (data: unknown): data is typeof customData => {
    return 'message' in (data as typeof customData)
  }

  const customData = {
    message: 'Custom not found message',
  }

  const DefaultNotFoundComponentWithProps = (props: NotFoundRouteProps) => (
    <div data-testid="default-not-found-with-props">
      <span data-testid="message">
        {isCustomData(props.data) && <span>{props.data.message}</span>}
      </span>
    </div>
  )

  const rootRoute = createRootRoute({
    component: () => (
      <div data-testid="root-component">
        <h1>Root Component</h1>
        <div>
          <Link
            data-testid="default-not-found-route-link"
            to="/default-not-found-route"
          >
            link to default not found route
          </Link>
          <Link data-testid="not-found-route-link" to="/not-found-route">
            link to not found route
          </Link>
        </div>
        <Outlet />
      </div>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <div data-testid="index-component">
        <h2>Index Page</h2>
      </div>
    ),
  })

  const defaultNotFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/default-not-found-route',
    loader: () => {
      throw notFound({ data: customData })
    },
    component: () => (
      <div data-testid="default-not-found-route-component">
        Should not render
      </div>
    ),
  })

  const notFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/not-found-route',
    loader: () => {
      throw notFound({ data: customData })
    },
    component: () => (
      <div data-testid="not-found-route-component">Should not render</div>
    ),
    notFoundComponent: (props) => (
      <div data-testid="not-found-with-props">
        <span data-testid="message">
          {isCustomData(props.data) && <span>{props.data.message}</span>}
        </span>
      </div>
    ),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      defaultNotFoundRoute,
      notFoundRoute,
    ]),
    history,
    defaultNotFoundComponent: DefaultNotFoundComponentWithProps,
  })

  render(<RouterProvider router={router} />)
  await router.load()
  await screen.findByTestId('root-component')

  const defaultNotFoundRouteLink = screen.getByTestId(
    'default-not-found-route-link',
  )
  defaultNotFoundRouteLink.click()

  const defaultNotFoundComponent = await screen.findByTestId(
    'default-not-found-with-props',
    {},
    { timeout: 1000 },
  )
  expect(defaultNotFoundComponent).toBeInTheDocument()

  const defaultNotFoundComponentMessage = await screen.findByTestId('message')
  expect(defaultNotFoundComponentMessage).toHaveTextContent(customData.message)

  const notFoundRouteLink = screen.getByTestId('not-found-route-link')
  notFoundRouteLink.click()

  const notFoundComponent = await screen.findByTestId(
    'not-found-with-props',
    {},
    { timeout: 1000 },
  )
  expect(notFoundComponent).toBeInTheDocument()

  const errorMessageComponent = await screen.findByTestId('message')
  expect(errorMessageComponent).toHaveTextContent(customData.message)
})
