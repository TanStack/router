import { For, createEffect } from 'solid-js'
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
} from '@tanstack/solid-router'

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

  createEffect(
    () => params(),
    () => {},
  )

  return null
}

function Search() {
  const search = useSearch({
    strict: false,
    select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
  })

  createEffect(
    () => search(),
    () => {},
  )

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
      <For each={selectors}>{() => <Params />}</For>
      <For each={selectors}>{() => <Search />}</For>
      <For each={selectors}>{() => <Links />}</For>
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
  component: () => {
    return <div />
  },
})

export function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/0'],
    }),
    scrollRestoration: true,
    routeTree: root.addChildren([route]),
  })

  const component = () => <RouterProvider router={router} />

  return { router, component }
}
