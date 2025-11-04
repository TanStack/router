import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  isMatch,
  useMatchRoute,
  useMatches,
} from '../src'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    return <Link to="/invoices/">To Invoices</Link>
  },
})

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices',
  loader: () => [{ id: '1' }, { id: '2' }],
  component: () => <Outlet />,
})

const InvoicesIndex = () => {
  const matches = useMatches<DefaultRouter>()

  const loaderDataMatches = matches.filter((match) =>
    isMatch(match, 'loaderData.0.id'),
  )

  const contextMatches = matches.filter((match) =>
    isMatch(match, 'context.permissions'),
  )

  const incorrectMatches = matches.filter((match) =>
    isMatch(match, 'loaderData.6.id'),
  )

  return (
    <div>
      <section>
        Loader Matches -{' '}
        {loaderDataMatches.map((match) => match.fullPath).join(',')}
      </section>
      <section>
        Context Matches -{' '}
        {contextMatches.map((match) => match.fullPath).join(',')}
      </section>
      <section>
        Incorrect Matches -{' '}
        {incorrectMatches.map((match) => match.fullPath).join(',')}
      </section>
    </div>
  )
}

const invoicesIndexRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '/',
  component: InvoicesIndex,
  context: () => ({
    permissions: 'permission',
  }),
})

const invoiceRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '$invoiceId',
  validateSearch: () => ({ page: 0 }),
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
})

const commentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'comments/$id',
  validateSearch: () => ({
    page: 0,
    search: '',
  }),
  loader: () =>
    [{ comment: 'one comment' }, { comment: 'two comment' }] as const,
})

const routeTree = rootRoute.addChildren([
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  indexRoute,
  layoutRoute.addChildren([commentsRoute]),
])

const defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof defaultRouter

test('when filtering useMatches by loaderData', async () => {
  render(<RouterProvider router={defaultRouter} />)

  const searchLink = await screen.findByRole('link', { name: 'To Invoices' })

  fireEvent.click(searchLink)

  expect(
    await screen.findByText('Loader Matches - /invoices'),
  ).toBeInTheDocument()

  expect(
    await screen.findByText('Context Matches - /invoices/'),
  ).toBeInTheDocument()

  expect(await screen.findByText('Incorrect Matches -')).toBeInTheDocument()
})

test('should show pendingComponent of root route', async () => {
  const root = createRootRoute({
    pendingComponent: () => <div data-testId="root-pending" />,
    loader: async () => {
      await new Promise((r) => setTimeout(r, 50))
    },
    component: () => <div data-testId="root-content" />,
  })

  const router = createRouter({
    routeTree: root,
    defaultPendingMs: 0,
    defaultPendingComponent: () => <div>default pending...</div>,
  })

  const rendered = render(<RouterProvider router={router} />)

  expect(await rendered.findByTestId('root-pending')).toBeInTheDocument()
  expect(await rendered.findByTestId('root-content')).toBeInTheDocument()
})

describe('matching on different param types', () => {
  const testCases = [
    {
      name: 'param with braces',
      path: '/$id',
      nav: '/1',
      params: { id: '1' },
    },
    {
      name: 'param without braces',
      path: '/{$id}',
      nav: '/2',
      params: { id: '2' },
    },
    {
      name: 'param with prefix',
      path: '/prefix-{$id}',
      nav: '/prefix-3',
      params: { id: '3' },
    },
    {
      name: 'param with suffix',
      path: '/{$id}-suffix',
      nav: '/4-suffix',
      params: { id: '4' },
    },
    {
      name: 'param with prefix and suffix',
      path: '/prefix-{$id}-suffix',
      nav: '/prefix-5-suffix',
      params: { id: '5' },
    },
    {
      name: 'wildcard with no braces',
      path: '/abc/$',
      nav: '/abc/6',
      params: { '*': '6', _splat: '6' },
    },
    {
      name: 'wildcard with braces',
      path: '/abc/{$}',
      nav: '/abc/7',
      params: { '*': '7', _splat: '7' },
    },
    {
      name: 'wildcard with prefix',
      path: '/abc/prefix{$}',
      nav: '/abc/prefix/8',
      params: { '*': '/8', _splat: '/8' },
    },
    {
      name: 'wildcard with suffix',
      path: '/abc/{$}suffix',
      nav: '/abc/9/suffix',
      params: { _splat: '9/', '*': '9/' },
    },
    {
      name: 'optional param with no prefix/suffix and value',
      path: '/abc/{-$id}/def',
      nav: '/abc/10/def',
      params: { id: '10' },
    },
    {
      name: 'optional param with no prefix/suffix and requiredParam and no value',
      path: '/abc/{-$id}/$foo/def',
      nav: '/abc/bar/def',
      params: { foo: 'bar' },
    },
    {
      name: 'optional param with no prefix/suffix and requiredParam and value',
      path: '/abc/{-$id}/$foo/def',
      nav: '/abc/10/bar/def',
      params: { id: '10', foo: 'bar' },
    },
    {
      name: 'optional param with no prefix/suffix and no value',
      path: '/abc/{-$id}/def',
      nav: '/abc/def',
      params: {},
    },
    {
      name: 'optional param with prefix and value',
      path: '/optional-{-$id}',
      nav: '/optional-12',
      params: { id: '12' },
    },
    {
      name: 'optional param with prefix and no value',
      path: '/optional-{-$id}',
      nav: '/optional-',
      params: {},
    },
    {
      name: 'optional param with suffix and value',
      path: '/{-$id}-optional',
      nav: '/13-optional',
      params: { id: '13' },
    },
    {
      name: 'optional param with suffix and no value',
      path: '/{-$id}-optional',
      nav: '/-optional',
      params: {},
    },
    {
      name: 'optional param with required param, prefix, suffix, wildcard and no value',
      path: `/$foo/a{-$id}-optional/$`,
      nav: '/bar/a-optional/qux',
      params: { foo: 'bar', _splat: 'qux', '*': 'qux' },
    },
    {
      name: 'optional param with required param, prefix, suffix, wildcard and value',
      path: `/$foo/a{-$id}-optional/$`,
      nav: '/bar/a14-optional/qux',
      params: { foo: 'bar', id: '14', _splat: 'qux', '*': 'qux' },
    },
  ]

  afterEach(() => cleanup())
  test.each(testCases)('$name', async ({ name, path, params, nav }) => {
    const rootRoute = createRootRoute()

    const Route = createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: RouteComponent,
    })

    function RouteComponent() {
      const routeParams = Route.useParams()
      const matchRoute = useMatchRoute()
      const matchRouteMatch = matchRoute({
        to: path,
      })

      return (
        <div>
          <h1 data-testid="heading">{name}</h1>
          <div>
            Params{' '}
            <span data-testid="params">{JSON.stringify(routeParams)}</span>
            Matches{' '}
            <span data-testid="matches">{JSON.stringify(matchRouteMatch)}</span>
          </div>
        </div>
      )
    }

    const router = createRouter({
      routeTree: rootRoute.addChildren([Route]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await act(() => render(<RouterProvider router={router} />))

    act(() => router.history.push(nav))

    const paramsToCheck = await screen.findByTestId('params')
    const matchesToCheck = await screen.findByTestId('matches')

    expect(JSON.parse(paramsToCheck.textContent)).toEqual(params)
    expect(JSON.parse(matchesToCheck.textContent)).toEqual(params)
  })
})
