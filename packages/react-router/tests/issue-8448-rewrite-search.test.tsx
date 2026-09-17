import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
} from '../src'

afterEach(cleanup)

it.each(
  [false, true].flatMap((rewrite) =>
    [
      { search: '?q=a*b', canonical: '?q=a*b' },
      { search: '?q=a%2Ab', canonical: '?q=a*b' },
      { search: '?q=a%2Ab', canonical: '?q=a*b', mask: true },
      { search: '?q=two%20words', canonical: '?q=two+words' },
      { search: '?a=1&&b=2', canonical: '?a=1&b=2' },
      {
        search: '?q=two+words',
        canonical: '?q=two%20words',
        stringifySearch: (search: Record<string, unknown>) =>
          defaultStringifySearch(search).replaceAll('+', '%20'),
      },
    ].map((options) => ({ rewrite, ...options })),
  ),
)(
  'canonicalizes the initial SPA URL once with search=$search and rewrite=$rewrite and mask=$mask',
  async ({ rewrite, search, canonical, stringifySearch, mask }) => {
    const loader = vi.fn(() => 'loaded page')
    const root = createRootRoute({ component: Outlet })
    const page = createRoute({
      getParentRoute: () => root,
      path: '/page',
      loader,
      component: () => <div>{page.useLoaderData()}</div>,
    })
    const visible = createRoute({
      getParentRoute: () => root,
      path: '/visible',
    })
    const routeTree = root.addChildren([page, visible])
    const history = createMemoryHistory({
      initialEntries: [`/page${search}`],
    })
    const router = createRouter({
      history,
      routeTree,
      routeMasks: mask
        ? [{ routeTree, from: '/page', to: '/visible', search: true }]
        : undefined,
      stringifySearch,
      rewrite: rewrite
        ? { input: () => undefined, output: () => undefined }
        : undefined,
    })

    await act(async () => {
      render(<RouterProvider router={router} />)
    })

    expect(screen.getByText('loaded page')).toBeInTheDocument()
    expect(history.location.href).toBe(
      `/${mask ? 'visible' : 'page'}${canonical}`,
    )
    expect(history.length).toBe(1)
    expect(loader).toHaveBeenCalledOnce()
  },
)
