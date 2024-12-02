import { z } from 'zod'
import {
  AnyRoute,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  retainSearchParams,
  RouterOptions,
  RouterProvider,
  useSearch,
} from '../src'
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

function createTestRouter(options?: RouterOptions<AnyRoute, 'never'>) {
  const root = createRootRoute({
    validateSearch: z.object({
      root: z.string().optional().default('root'),
    }),
    search: {
      middlewares: [retainSearchParams(['root'])],
    },
    component: () => {
      const search = root.useSearch()
      return (
        <>
          <span data-testid="root-useSearch">{search.root}</span>
          <Link data-testid="root-link" to="/">
            root
          </Link>
          <Link
            data-testid="a-link-with-custom"
            to="/a"
            search={{ root: 'custom' }}
          >
            set root to custom
          </Link>
          <Outlet />
        </>
      )
    },
  })

  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
  })
  const child = createRoute({
    getParentRoute: () => root,
    path: '/child',
  })

  const router = createRouter({
    routeTree: root.addChildren([index, child]),
    ...options,
  })

  return router
}

async function checkSearch(expectedSearch: { root: string }) {
  expect(await screen.findByTestId('root-useSearch')).toHaveTextContent(
    expectedSearch.root,
  )
  expect(new URLSearchParams(location.search).get('root')).toEqual(
    expectedSearch.root,
  )
}

async function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

describe('my temp test regarding retain sp', () => {
  it('should retain sp after navigating back', async () => {
    window.history.replaceState(null, '', `/`)
    const router = createTestRouter()

    render(<RouterProvider router={router} />)
    await act(async () => await router.load())
    await checkSearch({ root: 'root' })

    const linkA = await screen.findByTestId('a-link-with-custom')
    expect(linkA).toBeInTheDocument()
    fireEvent.click(linkA)
    await checkSearch({ root: 'custom' })

    const linkRoot = await screen.findByTestId('root-link')
    expect(linkRoot).toBeInTheDocument()
    fireEvent.click(linkRoot)
    await checkSearch({ root: 'custom' })
  })
})
