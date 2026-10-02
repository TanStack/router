import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useChildMatches,
  useMatch,
  useParentMatches,
  useRouter,
} from '../src'
import type { AnyRouter } from '../src'

afterEach(cleanup)

function NearestMatch({ name }: { name: string }) {
  const match = useMatch({ strict: false })
  return <span data-testid={name}>{match.routeId}</span>
}

function createTestRouter(
  disableGlobalCatchBoundary = false,
  isServer = false,
) {
  const root = createRootRoute({
    shellComponent: function Shell({ children }) {
      const [count, setCount] = React.useState(0)
      return (
        <section data-testid="shell">
          <NearestMatch name="shell-match" />
          <button onClick={() => setCount(count + 1)}>Count {count}</button>
          {children}
        </section>
      )
    },
    component: () => (
      <>
        <NearestMatch name="root-match" />
        <Outlet />
      </>
    ),
  })
  const first = createRoute({
    getParentRoute: () => root,
    path: '/first',
    component: () => <NearestMatch name="leaf-match" />,
  })
  const second = createRoute({
    getParentRoute: () => root,
    path: '/second',
    component: () => <NearestMatch name="leaf-match" />,
  })
  return createRouter({
    routeTree: root.addChildren([first, second]),
    history: createMemoryHistory({ initialEntries: ['/first'] }),
    disableGlobalCatchBoundary,
    isServer,
  })
}

test.each([false, true])(
  'shell keeps nearest match context and state across navigation (global catch disabled: %s)',
  async (disableGlobalCatchBoundary) => {
    const router = createTestRouter(disableGlobalCatchBoundary)
    await router.load()
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('leaf-match')).toHaveTextContent('/first')
    expect(screen.getByTestId('shell-match')).toHaveTextContent('__root__')
    expect(screen.getByTestId('root-match')).toHaveTextContent('__root__')
    const shell = screen.getByTestId('shell')
    act(() => screen.getByRole('button').click())
    await act(async () => {
      await router.navigate({ to: '/second' })
    })
    expect(screen.getByTestId('leaf-match')).toHaveTextContent('/second')
    expect(screen.getByTestId('shell-match')).toHaveTextContent('__root__')
    expect(screen.getByTestId('shell')).toBe(shell)
    expect(screen.getByRole('button')).toHaveTextContent('Count 1')
  },
)

test('server shell and nested component read their nearest match context', async () => {
  const router = createTestRouter(false, true)
  await router.load()
  const html = renderToString(<RouterProvider router={router} />)
  expect(html).toContain('data-testid="shell-match">__root__')
  expect(html).toContain('data-testid="root-match">__root__')
  expect(html).toContain('data-testid="leaf-match">/first')
})

function MatchSelections({
  name,
  expectedRouter,
}: {
  name: string
  expectedRouter: AnyRouter
}) {
  const router = useRouter()
  const nearest = useMatch({ strict: false })
  const parents = useParentMatches({
    select: (matches) => matches.map((match) => match.routeId).join(','),
  })
  const children = useChildMatches({
    select: (matches) => matches.map((match) => match.routeId).join(','),
  })
  return (
    <output data-testid={name}>
      {`${nearest.routeId}|${parents}|${children}|${String(nearest.loaderData)}|${router === expectedRouter ? 'exact' : 'wrong'}`}
    </output>
  )
}

test('route components read nearest, parent, child and Outlet selections', async () => {
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    loader: () => 'parent',
    component: () => (
      <>
        <MatchSelections name="parent-selection" expectedRouter={router} />
        <Outlet />
      </>
    ),
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    loader: () => 'child',
    component: () => (
      <MatchSelections name="child-selection" expectedRouter={router} />
    ),
  })
  const router: AnyRouter = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('parent-selection')).toHaveTextContent(
    '/parent|__root__|/parent/child|parent|exact',
  )
  expect(screen.getByTestId('child-selection')).toHaveTextContent(
    '/parent/child|__root__,/parent||child|exact',
  )
})

test('the same component can switch between an explicit match and its nearest match', async () => {
  function Selection() {
    const [explicit, setExplicit] = React.useState(true)
    const [count, setCount] = React.useState(0)
    const match = useMatch<AnyRouter, string, boolean>(
      explicit ? { from: '/parent' } : { strict: false },
    )
    return (
      <>
        <output data-testid="selection">{match.routeId}</output>
        <button onClick={() => setExplicit(!explicit)}>Toggle selection</button>
        <button onClick={() => setCount(count + 1)}>Count {count}</button>
      </>
    )
  }
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    path: '/parent',
    component: Outlet,
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: '/child',
    component: Selection,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([child])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })
  render(<RouterProvider router={router} />)
  const selection = await screen.findByTestId('selection')
  expect(selection).toHaveTextContent('/parent')
  fireEvent.click(screen.getByRole('button', { name: 'Count 0' }))
  fireEvent.click(screen.getByRole('button', { name: 'Toggle selection' }))
  expect(screen.getByTestId('selection')).toBe(selection)
  expect(selection).toHaveTextContent('/parent/child')
  expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Toggle selection' }))
  expect(selection.textContent).toBe('/parent')
  expect(screen.getByRole('button', { name: 'Count 1' })).toBeTruthy()
})
