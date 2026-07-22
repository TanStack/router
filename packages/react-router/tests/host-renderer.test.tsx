import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  CatchBoundary,
  Matches,
  Outlet,
  RouteLinkProvider,
  RouterContextProviderBase,
  RouterRendererProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  resolveNativeRouteOptions,
} from '../src/native'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('Route.Link delegates rendering to the host renderer', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <indexRoute.Link to="/details" data-testid="route-link">
        Details
      </indexRoute.Link>
    ),
  })
  const detailsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/details',
    component: () => <>Details route</>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  const HostLink = React.forwardRef<
    HTMLButtonElement,
    { children?: React.ReactNode; from?: unknown; to?: unknown }
  >(function HostLink({ children, from, to }, ref) {
    return (
      <button
        ref={ref}
        data-testid="host-link"
        data-from={String(from)}
        data-to={String(to)}
      >
        {children}
      </button>
    )
  })

  render(
    <RouteLinkProvider component={HostLink}>
      <RouterContextProviderBase router={router}>
        <Matches includeTransitioner={false} />
      </RouterContextProviderBase>
    </RouteLinkProvider>,
  )

  expect(screen.getByTestId('host-link')).toHaveTextContent('Details')
  expect(screen.getByTestId('host-link')).toHaveAttribute('data-from', '/')
  expect(screen.getByTestId('host-link')).toHaveAttribute('data-to', '/details')
  expect(screen.queryByTestId('route-link')).not.toBeInTheDocument()
})

test('CatchBoundary uses the host renderer error component', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  function BrokenComponent(): React.ReactNode {
    throw new Error('native failure')
  }

  render(
    <RouterRendererProvider
      renderer={{
        errorComponent: ({ error }) => (
          <output data-testid="host-error">{error.message}</output>
        ),
        notFoundComponent: () => <output>Host not found</output>,
      }}
    >
      <CatchBoundary getResetKey={() => 0}>
        <BrokenComponent />
      </CatchBoundary>
    </RouterRendererProvider>,
  )

  expect(screen.getByTestId('host-error')).toHaveTextContent('native failure')
})

test('CatchBoundary preserves its web fallback outside RouterProvider', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  function BrokenComponent(): React.ReactNode {
    throw new Error('web failure')
  }

  render(
    <CatchBoundary getResetKey={() => 0}>
      <BrokenComponent />
    </CatchBoundary>,
  )

  expect(screen.getByText('Something went wrong!')).toBeInTheDocument()
  expect(screen.getByText('web failure')).toBeInTheDocument()
})

test('native route options inherit and resolve against the retained state', async () => {
  const rootRoute = createRootRoute({
    native: {
      headerLargeTitle: true,
      headerStyle: { backgroundColor: 'white' },
    },
  })
  const detailsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/details/$detailId',
    native: (context) => ({
      title: `${context.params.detailId}:${context.canGoBack}`,
      headerStyle: { backgroundColor: 'blue' },
    }),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  await router.navigate({
    to: '/details/$detailId',
    params: { detailId: '42' },
  })

  const resolved = resolveNativeRouteOptions(router, router.state)

  expect(resolved.context.pathname).toBe('/details/42')
  expect(resolved.context.routeId).toBe('/details/$detailId')
  expect(resolved.options).toMatchObject({
    title: '42:true',
    headerLargeTitle: true,
    headerStyle: { backgroundColor: 'blue' },
  })
})
