import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

type LayoutOptions = {
  beforeLoad?: () => unknown
  loader?: () => unknown
  shouldReload?: boolean | (() => boolean)
}

// A layout retained across a child navigation, recording every `isFetching`
// value it renders with.
async function renderRetainedLayout(
  layoutOptions: LayoutOptions,
  aOptions: Pick<LayoutOptions, 'beforeLoad'> = {},
) {
  const renderedFetching: Array<unknown> = []
  const rootRoute = createRootRoute({ component: Outlet })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'layout',
    ...layoutOptions,
    component: () => {
      renderedFetching.push(
        layoutRoute.useMatch({ select: (match) => match.isFetching }),
      )
      return <Outlet />
    },
  })
  const aRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/a',
    ...aOptions,
    component: () => <div>Page A</div>,
  })
  const bRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/b',
    component: () => <div>Page B</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([aRoute, bRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Page A')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))
  renderedFetching.length = 0

  return { router, renderedFetching }
}

describe('retained match isFetching', () => {
  test('a synchronous beforeLoad does not re-render the retained route', async () => {
    let beforeLoadCalls = 0
    const { router, renderedFetching } = await renderRetainedLayout({
      beforeLoad: () => {
        beforeLoadCalls++
        return { user: 'test' }
      },
    })

    await act(() => router.navigate({ to: '/b' }))

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(beforeLoadCalls).toBe(2)
    expect(renderedFetching).toEqual([])
  })

  test('an asynchronous beforeLoad exposes its pending window', async () => {
    const gate = createControlledPromise<void>()
    let beforeLoadCalls = 0
    const { router, renderedFetching } = await renderRetainedLayout({
      beforeLoad: () => (beforeLoadCalls++ ? gate : undefined),
    })

    let navigation!: Promise<void>
    await act(async () => {
      navigation = router.navigate({ to: '/b' })
      await Promise.resolve()
    })
    await waitFor(() => expect(renderedFetching).toEqual(['beforeLoad']))

    await act(async () => {
      gate.resolve()
      await navigation
    })

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(renderedFetching).toEqual(['beforeLoad', false])
  })

  test('a reloading loader exposes its fetching window', async () => {
    const gate = createControlledPromise<string>()
    let loaderCalls = 0
    const { router, renderedFetching } = await renderRetainedLayout({
      shouldReload: true,
      loader: () => (loaderCalls++ ? gate : 'initial'),
    })

    let navigation!: Promise<void>
    await act(async () => {
      navigation = router.navigate({ to: '/b' })
      await Promise.resolve()
    })
    await waitFor(() => expect(renderedFetching).toEqual(['loader']))

    await act(async () => {
      gate.resolve('reloaded')
      await navigation
    })

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    await waitFor(() => expect(renderedFetching).toEqual(['loader', false]))
  })

  test('a superseding navigation clears the retained fetching state', async () => {
    const reload = createControlledPromise<string>()
    const enter = createControlledPromise<void>()
    let loaderCalls = 0
    let aBeforeLoadCalls = 0
    const { router, renderedFetching } = await renderRetainedLayout(
      {
        shouldReload: () => loaderCalls === 1,
        loader: () => (loaderCalls++ ? reload : 'initial'),
      },
      { beforeLoad: () => (aBeforeLoadCalls++ ? enter : undefined) },
    )

    await act(async () => {
      void router.navigate({ to: '/b' })
      await Promise.resolve()
    })
    await waitFor(() => expect(renderedFetching).toEqual(['loader']))

    let navigation!: Promise<void>
    await act(async () => {
      navigation = router.navigate({ to: '/a' })
      await Promise.resolve()
    })
    await waitFor(() => expect(renderedFetching).toEqual(['loader', false]))

    await act(async () => {
      enter.resolve()
      reload.resolve('reloaded')
      await navigation
    })
    expect(await screen.findByText('Page A')).toBeInTheDocument()
  })
})
