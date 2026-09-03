import React from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  retainSearchParams,
} from '../src'

afterEach(() => {
  cleanup()
})

/**
 * `useLinkProps` memoizes `buildLocation` per stable options object and only
 * rebuilds when a part of the current location that the options actually read
 * has changed. These cases all read something, so their hrefs and active state
 * must keep moving with the location.
 */
function setup(
  linkGrid: () => React.ReactNode,
  opts?: { routeMasks?: boolean },
) {
  const rootRoute = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => search,
    search: { middlewares: [retainSearchParams(['tab'])] },
    component: () => (
      <>
        <nav>{linkGrid()}</nav>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>index</div>,
  })
  const itemsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    component: () => <Outlet />,
  })
  const detailRoute = createRoute({
    getParentRoute: () => itemsRoute,
    path: '/detail',
    component: () => <div>detail</div>,
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    itemsRoute.addChildren([detailRoute]),
  ])

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/items/1?tab=a#one'] }),
    routeMasks: opts?.routeMasks
      ? [
          createRouteMask({
            routeTree,
            from: '/items/$id/detail',
            to: '/items/$id',
            params: (prev) => ({ id: prev.id ?? '' }),
          }),
        ]
      : undefined,
  })

  return { router }
}

async function renderRouter(router: any) {
  await act(async () => {
    render(<RouterProvider router={router} />)
    await router.load()
  })
}

function hrefOf(testId: string) {
  return screen.getByTestId(testId).getAttribute('href')
}

describe('Link buildLocation memo', () => {
  test('relative, inherited-param, search and hash links follow the location', async () => {
    const { router } = setup(() => (
      <>
        <Link to="." data-testid="self">
          self
        </Link>
        <Link to="/items/$id/detail" data-testid="inherited">
          inherited
        </Link>
        <Link to="/items/$id/detail" params={true} data-testid="params-true">
          params true
        </Link>
        <Link
          to="/items/$id/detail"
          params={(prev: any) => ({ id: `${prev.id}0` })}
          data-testid="params-fn"
        >
          params fn
        </Link>
        <Link to="/" search={true} data-testid="search-true">
          search true
        </Link>
        <Link
          to="/"
          search={(prev: any) => ({ ...prev, extra: 1 })}
          data-testid="search-fn"
        >
          search fn
        </Link>
        <Link to="/" data-testid="retained">
          retained
        </Link>
        <Link to="/" hash={true} data-testid="hash-true">
          hash true
        </Link>
        <Link
          to="/items/$id"
          params={{ id: '9' }}
          data-testid="independent"
          activeProps={{ className: 'is-active' }}
        >
          independent
        </Link>
      </>
    ))
    await renderRouter(router)

    expect(hrefOf('self')).toBe('/items/1?tab=a')
    expect(hrefOf('inherited')).toBe('/items/1/detail?tab=a')
    expect(hrefOf('params-true')).toBe('/items/1/detail?tab=a')
    expect(hrefOf('params-fn')).toBe('/items/10/detail?tab=a')
    expect(hrefOf('search-true')).toBe('/?tab=a')
    expect(hrefOf('search-fn')).toBe('/?tab=a&extra=1')
    expect(hrefOf('retained')).toBe('/?tab=a')
    expect(hrefOf('hash-true')).toBe('/?tab=a#one')
    expect(hrefOf('independent')).toBe('/items/9?tab=a')
    expect(screen.getByTestId('independent').className).not.toContain(
      'is-active',
    )

    await act(async () => {
      await router.navigate({
        to: '/items/$id',
        params: { id: '9' },
        search: { tab: 'b' },
        hash: 'two',
      })
    })

    expect(hrefOf('self')).toBe('/items/9?tab=b')
    expect(hrefOf('inherited')).toBe('/items/9/detail?tab=b')
    expect(hrefOf('params-true')).toBe('/items/9/detail?tab=b')
    expect(hrefOf('params-fn')).toBe('/items/90/detail?tab=b')
    expect(hrefOf('search-true')).toBe('/?tab=b')
    expect(hrefOf('search-fn')).toBe('/?tab=b&extra=1')
    expect(hrefOf('retained')).toBe('/?tab=b')
    expect(hrefOf('hash-true')).toBe('/?tab=b#two')
    // The independent link's href never moves, but its active state does.
    expect(hrefOf('independent')).toBe('/items/9?tab=b')
    expect(screen.getByTestId('independent').className).toContain('is-active')

    await act(async () => {
      await router.navigate({ to: '/', search: { tab: 'b' } })
    })

    expect(hrefOf('self')).toBe('/?tab=b')
    expect(screen.getByTestId('independent').className).not.toContain(
      'is-active',
    )
  })

  test('includeHash active option tracks the current hash', async () => {
    const { router } = setup(() => (
      <Link
        to="/items/$id"
        params={{ id: '1' }}
        hash="one"
        activeOptions={{ includeHash: true, includeSearch: false }}
        activeProps={{ className: 'is-active' }}
        data-testid="hashed"
      >
        hashed
      </Link>
    ))
    await renderRouter(router)

    expect(screen.getByTestId('hashed').className).toContain('is-active')

    await act(async () => {
      await router.navigate({
        to: '/items/$id',
        params: { id: '1' },
        hash: 'two',
      })
    })
    expect(screen.getByTestId('hashed').className).not.toContain('is-active')
  })

  test('an explicit mask keeps resolving against the current location', async () => {
    const { router } = setup(() => (
      <Link
        to="/items/$id"
        params={{ id: '9' }}
        mask={{ to: '/items/$id/detail', params: true }}
        data-testid="masked"
      >
        masked
      </Link>
    ))
    await renderRouter(router)

    expect(hrefOf('masked')).toBe('/items/1/detail?tab=a')

    await act(async () => {
      await router.navigate({ to: '/items/$id', params: { id: '5' } })
    })
    expect(hrefOf('masked')).toBe('/items/5/detail?tab=a')
  })

  test('routeMasks keep resolving across navigations', async () => {
    const { router } = setup(
      () => (
        <Link
          to="/items/$id/detail"
          params={{ id: '9' }}
          data-testid="auto-masked"
        >
          auto masked
        </Link>
      ),
      { routeMasks: true },
    )
    await renderRouter(router)

    expect(hrefOf('auto-masked')).toBe('/items/9?tab=a')

    await act(async () => {
      await router.navigate({ to: '/items/$id', params: { id: '5' } })
    })
    expect(hrefOf('auto-masked')).toBe('/items/9?tab=a')
  })
})
