import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { z } from 'zod'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useSearchState,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

test('multiple setSearchState calls in the same batch are accumulated (same key)', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const [page, setPage] = useSearchState({
      key: 'page',
      from: '/',
    })
    return (
      <React.Fragment>
        <output>{page}</output>
        <button onClick={() => setPage((prev: number) => prev + 1)}>
          increment
        </button>
      </React.Fragment>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({
      page: z.coerce.number().optional().default(0),
    }),
    component: IndexComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
  })

  const history: Array<
    Parameters<Parameters<typeof router.history.subscribe>[0]>[0]
  > = []
  router.history.subscribe((action) => history.push(action))
  // @ts-expect-error -- mock function
  router.navigate = vi.fn(router.navigate)
  render(<RouterProvider router={router} />)
  const output = await screen.findByRole('status')
  expect(output).toHaveTextContent('0')
  expect(window.location.search).toBe('?page=0')
  const initialHistoryLength = history.length

  const incrementButton = await screen.findByRole('button', {
    name: 'increment',
  })
  await act(() => {
    fireEvent.click(incrementButton)
    fireEvent.click(incrementButton)
  })
  await waitFor(() => expect(output).toHaveTextContent('2'))
  expect(window.location.search).toBe('?page=2')
  expect(router.navigate).toHaveBeenCalledTimes(1)
  expect(history).toHaveLength(initialHistoryLength + 1)
})

test('multiple setSearchState calls in the same batch are accumulated (different keys)', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const [a, setA] = useSearchState({ key: 'a', from: '/' })
    const [b, setB] = useSearchState({ key: 'b', from: '/' })
    return (
      <React.Fragment>
        <output>{`a: ${a}, b: ${b}`}</output>
        <button
          onClick={() => {
            setA(1)
            setB(1)
          }}
        >
          Increment Both
        </button>
      </React.Fragment>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({
      a: z.coerce.number().optional().default(0),
      b: z.coerce.number().optional().default(0),
    }),
    component: IndexComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
  })

  const history: Array<
    Parameters<Parameters<typeof router.history.subscribe>[0]>[0]
  > = []
  router.history.subscribe((action) => history.push(action))
  // @ts-expect-error -- mock function
  router.navigate = vi.fn(router.navigate)
  render(<RouterProvider router={router} />)

  const output = await screen.findByRole('status')
  expect(output).toHaveTextContent('a: 0, b: 0')
  expect(window.location.search).toBe('?a=0&b=0')
  const initialHistoryLength = history.length

  const incrementBothButton = await screen.findByRole('button', {
    name: 'Increment Both',
  })
  await act(() => fireEvent.click(incrementBothButton))
  await waitFor(() => expect(output).toHaveTextContent('a: 1, b: 1'))

  expect(window.location.search).toBe('?a=1&b=1')
  expect(router.navigate).toHaveBeenCalledTimes(1)
  expect(history).toHaveLength(initialHistoryLength + 1)
})

test('multiple setSearchState calls in the same batch only cause a single re-render', async () => {
  let renderCount = 0

  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    renderCount++
    const [state, setSearchState] = useSearchState({ key: 'page', from: '/' })
    return (
      <>
        <output>{state}</output>
        <button
          onClick={() => {
            setSearchState((p: number) => p + 1)
            setSearchState((p: number) => p + 1)
          }}
        >
          Increment
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({
      page: z.coerce.number().optional().default(0),
    }),
    component: IndexComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
  })

  render(<RouterProvider router={router} />)
  const output = await screen.findByRole('status')
  expect(output).toHaveTextContent('0')

  const incrementButton = await screen.findByRole('button', {
    name: 'Increment',
  })
  renderCount = 0 // reset after initial render

  await act(() => fireEvent.click(incrementButton))
  await waitFor(() => expect(output).toHaveTextContent('2'))

  // Should only re-render once for the batch update
  expect(renderCount).toBe(1)
})

test('setSearchState is overridden by a subsequent `navigate` call in the same batch', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const [state, setSearchState] = useSearchState({ key: 'foo', from: '/' })
    const navigate = useNavigate()
    return (
      <>
        <output>{state}</output>
        <button
          onClick={() => {
            setSearchState('bar')
            navigate({ to: '/baz' })
          }}
        >
          Set and Navigate
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({
      foo: z.string().optional(),
    }),
    component: IndexComponent,
  })

  const bazRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/baz',
    validateSearch: z.object({
      foo: z.string().optional(),
    }),
    component: IndexComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, bazRoute]),
  })

  // @ts-expect-error -- mock function
  router.navigate = vi.fn(router.navigate)

  render(<RouterProvider router={router} />)
  const output = await screen.findByRole('status')
  expect(output).toHaveTextContent('')

  const button = await screen.findByRole('button', { name: 'Set and Navigate' })
  await act(() => fireEvent.click(button))
  await waitFor(() => expect(window.location.pathname).toBe('/baz'))
  expect(output).toHaveTextContent('')

  // The search should be empty and the pathname should have changed
  expect(window.location.pathname).toBe('/baz')
  expect(router.navigate).toHaveBeenCalledTimes(1)
  expect(window.location.search).toBe('')
})

// generally, calling `setSearchState` in the same batch as a `navigate` call is undefined behavior
test.fails(
  'setSearchState will override a previous `navigate` call in the same batch',
  async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const [state, setSearchState] = useSearchState({ key: 'foo', from: '/' })
      const navigate = useNavigate()
      return (
        <>
          <output>{state}</output>
          <button
            onClick={() => {
              navigate({ to: '/bar' })
              setSearchState('foo')
            }}
          >
            Navigate and Set
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: z.object({
        foo: z.string().optional(),
      }),
      component: IndexComponent,
    })

    const barRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      validateSearch: z.object({
        foo: z.string().optional(),
      }),
      component: IndexComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, barRoute]),
    })

    render(<RouterProvider router={router} />)
    const output = await screen.findByRole('status')
    expect(output).toHaveTextContent('')

    const button = await screen.findByRole('button', {
      name: 'Navigate and Set',
    })
    await act(() => fireEvent.click(button))
    // Wait for the search param to be set
    await waitFor(() => expect(window.location.search).toBe('?foo=foo'))
    // Pathname should NOT have changed
    expect(window.location.pathname).toBe('/')
    // Output should reflect the new search state
    expect(output).toHaveTextContent('foo')
  },
)

// generally, calling `setSearchState` in the same batch as a `navigate` call is undefined behavior
test.fails(
  'setSearchState and a subsequent `navigate` can accumulate in the same batch',
  async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const [state, setSearchState] = useSearchState({ key: 'foo', from: '/' })
      const navigate = useNavigate()
      return (
        <>
          <output>{state}</output>
          <button
            onClick={() => {
              setSearchState('foo')
              navigate({ to: '/bar', search: (s: unknown) => s })
            }}
          >
            Set and Navigate
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: z.object({
        foo: z.string().optional(),
      }),
      component: IndexComponent,
    })

    const barRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      validateSearch: z.object({
        foo: z.string().optional(),
      }),
      component: () => <p>Bar</p>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, barRoute]),
    })

    render(<RouterProvider router={router} />)
    const output = await screen.findByRole('status')
    expect(output).toHaveTextContent('')

    const button = await screen.findByRole('button', {
      name: 'Set and Navigate',
    })
    await act(() => fireEvent.click(button))

    await waitFor(() => expect(window.location.pathname).toBe('/bar'))
    expect(window.location.search).toBe('?foo=foo')
  },
)

test('setSearchState does not generate a history entry if the value is the same', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const [search, setSearch] = useSearchState({ key: 'foo', from: '/' })
    return (
      <>
        <output>{search}</output>
        <button onClick={() => setSearch('bar')}>Set Foo</button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({
      foo: z.string().optional().default('bar'),
    }),
    component: IndexComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
  })

  const history: Array<
    Parameters<Parameters<typeof router.history.subscribe>[0]>[0]
  > = []
  router.history.subscribe((action) => history.push(action))

  // @ts-expect-error -- mock function
  router.navigate = vi.fn(router.navigate)

  render(<RouterProvider router={router} />)
  const output = await screen.findByRole('status')
  await waitFor(() => expect(output).toHaveTextContent('bar'))
  const initialHistoryLength = history.length

  // Click the button to set the same value again
  const button = await screen.findByRole('button', { name: 'Set Foo' })
  await act(() => fireEvent.click(button))

  // Value should remain the same
  expect(output).toHaveTextContent('bar')
  expect(window.location.search).toBe('?foo=bar')
  expect(router.navigate).toHaveBeenCalledTimes(0)
  // No new history entry should be added
  expect(history).toHaveLength(initialHistoryLength)
})

test('replace', async () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const [a, setA] = useSearchState({ key: 'a', from: '/' })
    const [b, setB] = useSearchState({ key: 'b', from: '/' })
    const [c, setC] = useSearchState({ key: 'c', from: '/' })
    const [d, setD] = useSearchState({ key: 'd', from: '/' })
    return (
      <React.Fragment>
        <output>{`a: ${a}, b: ${b}, c: ${c}, d: ${d}`}</output>
        <button
          onClick={() => {
            setA('foo')
          }}
        >
          Set A Only (default replace)
        </button>
        <button
          onClick={() => {
            setA('foo2')
            setB('bar2', { replace: false })
            setC('baz2', { replace: true })
            setD('qux2')
          }}
        >
          Mixed Replace Options
        </button>
      </React.Fragment>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z.object({
      a: z.string().optional().default('a'),
      b: z.string().optional().default('b'),
      c: z.string().optional().default('c'),
      d: z.string().optional().default('d'),
    }),
    component: IndexComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
  })

  const history: Array<
    Parameters<Parameters<typeof router.history.subscribe>[0]>[0]
  > = []
  router.history.subscribe((action) => history.push(action))
  // @ts-expect-error -- mock function
  router.navigate = vi.fn(router.navigate)
  render(<RouterProvider router={router} />)

  const output = await screen.findByRole('status')
  expect(output).toHaveTextContent('a: a, b: b, c: c, d: d')

  // Test 1: Single setSearchState call should use replace: true by default
  const setAOnlyButton = await screen.findByRole('button', {
    name: 'Set A Only (default replace)',
  })
  await act(() => fireEvent.click(setAOnlyButton))
  await waitFor(() =>
    expect(output).toHaveTextContent('a: foo, b: b, c: c, d: d'),
  )

  expect(router.navigate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      replace: true,
      search: { a: 'foo', b: 'b', c: 'c', d: 'd' },
    }),
  )

  // Test 2: Mixed replace options - if any call has replace: false, final navigate should use replace: false
  const mixedButton = await screen.findByRole('button', {
    name: 'Mixed Replace Options',
  })
  await act(() => fireEvent.click(mixedButton))
  await waitFor(() =>
    expect(output).toHaveTextContent('a: foo2, b: bar2, c: baz2, d: qux2'),
  )

  expect(router.navigate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      replace: false, // Should be false because setB was called with replace: false
      search: { a: 'foo2', b: 'bar2', c: 'baz2', d: 'qux2' },
    }),
  )
  expect(history.map((h) => h.action.type)).toEqual([
    // route validateSearch default values
    'REPLACE',
    // setSearchState without options, default to replace:true
    'REPLACE',
    // multiple setSearchState calls with mixed replace options
    'PUSH',
  ])
})

test.todo('ignoreBlocker', async () => {
  // if any `setSearchState` call in a batch is made with `ignoreBlocker: true`, the `navigate` call will be made with `ignoreBlocker: true`
})
test.todo('resetScroll', async () => {
  // if any `setSearchState` call in a batch is made with `resetScroll: true`, the `navigate` call will be made with `resetScroll: true`
})
test.todo('hashScrollIntoView', async () => {
  // if any `setSearchState` call in a batch is made with `hashScrollIntoView: true`, the `navigate` call will be made with `hashScrollIntoView: true`
})
test.todo('viewTransition', async () => {
  // if any `setSearchState` call in a batch is made with `viewTransition: true`, the `navigate` call will be made with `viewTransition: true`
  // if using a non-boolean value for `viewTransition`, it's last-write-wins
})
test.todo('reloadDocument', async () => {
  // if any `setSearchState` call in a batch is made with `reloadDocument: true`, the `navigate` call will be made with `reloadDocument: true`
})
