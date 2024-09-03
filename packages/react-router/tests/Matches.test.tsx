import { expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  isMatch,
  Link,
  RouterProvider,
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
