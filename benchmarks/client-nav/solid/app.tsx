import { For } from 'solid-js'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
  useParams,
  useSearch,
} from '@tanstack/solid-router'

function runPerfSelectorComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 50; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

const selectors = Array.from({ length: 20 }, (_, index) => index)

function Params() {
  const number = useParams({
    strict: false,
    select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
  })
  return <>{runPerfSelectorComputation(number())}</>
}

function Search() {
  const number = useSearch({
    strict: false,
    select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
  })
  return <>{runPerfSelectorComputation(number())}</>
}

function Match() {
  const number = useMatch({
    strict: false,
    select: (match) => runPerfSelectorComputation(Number(match.params.id ?? 0)),
  })
  return <>{runPerfSelectorComputation(number())}</>
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
      <For each={selectors}>{() => <Params />}</For>
      <For each={selectors}>{() => <Search />}</For>
      <For each={selectors}>{() => <Links />}</For>
      <For each={selectors}>{() => <Match />}</For>
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
  validateSearch: (search) => ({ id: search.id }),
  component: () => {
    return <div />
  },
  beforeLoad: () => Promise.resolve(),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: () => Promise.resolve(),
})

export function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/0'],
    }),
    scrollRestoration: true,
    routeTree: root.addChildren([route]),
    defaultPendingMinMs: 0,
  })

  const component = () => <RouterProvider router={router} />

  return { router, component }
}
