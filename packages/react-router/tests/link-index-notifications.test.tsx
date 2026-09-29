import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function setup(customFormatter = false) {
  const history = createMemoryHistory({ initialEntries: ['/a'] })
  let prefix = ''
  if (customFormatter) {
    history.createHref = (href) => `${prefix}${href}`
  }
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>): { sort?: string } => ({
      sort: typeof search.sort === 'string' ? search.sort : undefined,
    }),
    component: () => (
      <>
        <Link to="/a">Alpha</Link>
        <Link to="/b">Beta</Link>
        <Link to="/c">Unrelated</Link>
        <Link
          to="/a"
          search={{ sort: 'name' }}
          hash="here"
          activeOptions={{ exact: true, includeHash: true }}
        >
          Search and hash
        </Link>
        <Link to="/c" search={true}>Inherited</Link>
        <Outlet />
      </>
    ),
  })
  const children = ['/a', '/b', '/c'].map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <p>{path}</p>,
    }),
  )
  const router = createRouter({
    history,
    routeTree: root.addChildren(children),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('link', { name: 'Alpha' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  return { router, setPrefix: (value: string) => { prefix = value } }
}

test('retained fixed Links avoid unrelated destination work while old/new activity stays correct', async () => {
  const { router } = await setup()
  const build = vi.spyOn(router, 'buildLocation')
  await act(async () => {
    await router.navigate({ to: '/b' })
  })
  expect(screen.getByRole('link', { name: 'Alpha' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Unrelated' })).not.toHaveAttribute('aria-current')
  // The inherited Link is deliberately dynamic. The fixed /c Link must not
  // enter the builder merely because another pathname changed.
  expect(build.mock.calls.filter(([options]) => options.to === '/c' && options.search !== true)).toHaveLength(0)
})

test('search and hash changes still update path-eligible active predicates', async () => {
  const { router } = await setup()
  const link = screen.getByRole('link', { name: 'Search and hash' })
  await act(async () => {
    await router.navigate({ to: '/a', search: { sort: 'name' }, hash: 'here' })
  })
  expect(link).toHaveAttribute('aria-current', 'page')
  await act(async () => {
    await router.navigate({ to: '/a', search: { sort: 'name' }, hash: 'elsewhere' })
  })
  expect(link).not.toHaveAttribute('aria-current')
})

test('inherited destinations remain live even when their path cannot be active', async () => {
  const { router } = await setup()
  await act(async () => {
    await router.navigate({ to: '/b', search: { sort: 'date' } })
  })
  expect(screen.getByRole('link', { name: 'Inherited' }).getAttribute('href')).toContain('sort=date')
})

test('opaque custom formatters refresh inactive Links rather than trusting path independence', async () => {
  const { router, setPrefix } = await setup(true)
  setPrefix('/formatted')
  await act(async () => {
    await router.navigate({ to: '/b' })
  })
  expect(screen.getByRole('link', { name: 'Unrelated' })).toHaveAttribute('href', '/formatted/c')
})

test('router configuration changes invalidate prior fixed-destination proofs', async () => {
  const { router } = await setup()
  act(() => router.update({ basepath: '/mount' }))
  await act(async () => {
    await router.navigate({ to: '/b' })
  })
  expect(screen.getByRole('link', { name: 'Unrelated' })).toHaveAttribute('href', '/mount/c')
})
