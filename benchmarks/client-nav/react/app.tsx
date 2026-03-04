import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/react-router'

function runPerfSelectorComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 100; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

const selectors = Array.from({ length: 20 }, (_, index) => index)

function Params() {
  const params = useParams({
    strict: false,
    select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
  })
  void params
  return null
}

function Search() {
  const search = useSearch({
    strict: false,
    select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
  })
  void search
  return null
}

function Links() {
  return (
    <Link to="/$id" params={{ id: '0' }} search={{ id: '0' }}>
      Link
    </Link>
  )
}

function Root() {
  return (
    <>
      {selectors.map((selector) => (
        <Params key={selector} />
      ))}
      {selectors.map((selector) => (
        <Search key={selector} />
      ))}
      {selectors.map((selector) => (
        <Links key={selector} />
      ))}
      <Outlet />
    </>
  )
}

const root = createRootRoute({
  component: Root,
})

const route = createRoute({
  getParentRoute: () => root,
  path: '/$id',
  component: () => <div />,
})

export function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/0'],
    }),
    scrollRestoration: true,
    routeTree: root.addChildren([route]),
  })

  const component = <RouterProvider router={router} />

  return { router, component }
}
