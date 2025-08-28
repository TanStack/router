import { expect, test } from 'vitest'
import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createContext, useContext } from 'solid-js'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isMatch,
  useMatches,
} from '../src'
import { sleep } from './utils'

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
  console.log('Matchse', matches())

  const loaderDataMatches = matches().filter((match) =>
    isMatch(match, 'loaderData.0.id'),
  )

  const contextMatches = matches().filter((match) =>
    isMatch(match, 'context.permissions'),
  )

  const incorrectMatches = matches().filter((match) =>
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
  render(() => <RouterProvider router={defaultRouter} />)

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

test('Matches provides InnerWrap context to route components', async () => {
  const rootRoute = createRootRoute({
    component: () => {
      const contextValue = useContext(ctx)
      expect(contextValue, 'Context is not provided').not.toBeUndefined()

      return <div>{contextValue}</div>
    },
  })

  const routeTree = rootRoute.addChildren([])
  const router = createRouter({
    routeTree,
  })

  const ctx = createContext<string>()

  const app = render(() => (
    <RouterProvider
      router={router}
      InnerWrap={(props) => {
        return (
          <ctx.Provider value={'context-for-children'}>
            {props.children}
          </ctx.Provider>
        )
      }}
    />
  ))

  const indexElem = await app.findByText('context-for-children')
  expect(indexElem).toBeInTheDocument()
})

test('Matches provides InnerWrap context to defaultPendingComponent', async () => {
  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      return (
        <div>
          <Link to="/home">link to home</Link>
        </div>
      )
    },
  })

  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    loader: () => sleep(300),
    component: () => <div>Home page</div>,
  })

  const routeTree = rootRoute.addChildren([homeRoute, indexRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/'],
    }),
  })

  const ctx = createContext<string>()

  const app = render(() => (
    <RouterProvider
      router={router}
      defaultPendingMs={200}
      defaultPendingComponent={() => {
        const contextValue = useContext(ctx)
        expect(contextValue, 'Context is not provided').not.toBeUndefined()

        return <div>{contextValue}</div>
      }}
      InnerWrap={(props) => {
        return (
          <ctx.Provider value={'context-for-default-pending'}>
            {props.children}
          </ctx.Provider>
        )
      }}
    />
  ))

  const linkToHome = await app.findByRole('link', {
    name: 'link to home',
  })
  expect(linkToHome).toBeInTheDocument()

  fireEvent.click(linkToHome)

  const indexElem = await app.findByText('context-for-default-pending')
  expect(indexElem).toBeInTheDocument()
})
