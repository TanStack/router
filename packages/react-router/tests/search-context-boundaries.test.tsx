import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '../src/ssr/server'

afterEach(cleanup)

const path = '/parent/child?name=Alice&__proto__=%7B%22isAdmin%22%3Atrue%7D'

function createRouteTree() {
  const rootRoute = createRootRoute()
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: ({ search }): Record<string, unknown> => search,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: ({ context }) => ({
      name: context.name,
      access: context.isAdmin ? 'admin' : 'visitor',
    }),
    component: () => {
      const { name, access } = childRoute.useLoaderData()
      return <output data-testid="access">{`${name}: ${access}`}</output>
    },
  })

  return rootRoute.addChildren([parentRoute.addChildren([childRoute])])
}

test('search-derived ancestor context does not grant inherited properties to a client loader', async () => {
  const router = createRouter({
    routeTree: createRouteTree(),
    history: createMemoryHistory({ initialEntries: [path] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('access')).toHaveTextContent(
    'Alice: visitor',
  )
})

test('search-derived ancestor context does not grant inherited properties to an SSR loader', async () => {
  const response = await createRequestHandler({
    request: new Request(`http://localhost${path}`),
    createRouter: () =>
      createRouter({ routeTree: createRouteTree(), isServer: true }),
  })(({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
  )

  expect(response.status).toBe(200)
  const document = new DOMParser().parseFromString(
    await response.text(),
    'text/html',
  )
  expect(document.querySelector('[data-testid="access"]')?.textContent).toBe(
    'Alice: visitor',
  )
})
