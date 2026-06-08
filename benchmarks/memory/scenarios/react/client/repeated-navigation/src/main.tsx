import * as React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useSearch,
} from '@tanstack/react-router'

declare global {
  interface Window {
    __memoryBenchmark: {
      runBatch: (iterations: number) => Promise<void>
    }
  }
}

type SearchState = {
  filter?: string
  page?: number
  q?: string
}

const probes = Array.from({ length: 20 }, (_, index) => index)

function validateSearch(search: Record<string, unknown>): SearchState {
  const page = Number(search.page)

  return {
    filter: typeof search.filter === 'string' ? search.filter : undefined,
    page: Number.isFinite(page) ? page : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }
}

function ParamsProbe({ index }: { index: number }) {
  const params = useParams({
    strict: false,
  })

  return (
    <span hidden>
      {index}:{String(params.itemId ?? params.a ?? '')}
    </span>
  )
}

function SearchProbe({ index }: { index: number }) {
  const search = useSearch({
    strict: false,
  })

  return (
    <span hidden>
      {index}:{String(search.q ?? search.filter ?? search.page ?? '')}
    </span>
  )
}

function LinkProbe({ index }: { index: number }) {
  return (
    <Link
      to="/items/$itemId"
      params={{ itemId: String(index) }}
      search={{ filter: 'link', page: index, q: `link-${index}` }}
      preload={false}
    >
      item {index}
    </Link>
  )
}

function Workload({ label }: { label: string }) {
  return (
    <main>
      <h1>{label}</h1>
      {probes.map((probe) => (
        <ParamsProbe key={`params-${probe}`} index={probe} />
      ))}
      {probes.map((probe) => (
        <SearchProbe key={`search-${probe}`} index={probe} />
      ))}
      <nav>
        {probes.map((probe) => (
          <LinkProbe key={`link-${probe}`} index={probe} />
        ))}
      </nav>
    </main>
  )
}

const rootRoute = createRootRoute({
  component: RootComponent,
  validateSearch,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Workload label="index" />,
})

const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$itemId',
  validateSearch,
  component: () => <Workload label="item" />,
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  validateSearch,
  component: () => <Workload label="search" />,
})

const nestedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nested/$a/$b/$c',
  validateSearch,
  component: () => <Workload label="nested" />,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  itemRoute,
  searchRoute,
  nestedRoute,
])

const router = createRouter({
  routeTree,
  defaultPreload: false,
  scrollRestoration: false,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function RootComponent() {
  return <Outlet />
}

function waitForRendered() {
  return new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe()
      resolve()
    })
  })
}

async function navigateAndWait(options: any) {
  const rendered = waitForRendered()
  await router.navigate(options)
  await rendered
}

let actionIndex = 0

window.__memoryBenchmark = {
  async runBatch(iterations) {
    for (let index = 0; index < iterations; index++) {
      const currentIndex = actionIndex
      actionIndex += 1

      const value = String(currentIndex % 10_000)
      const step = currentIndex % 4

      if (step === 0) {
        await navigateAndWait({
          to: '/items/$itemId',
          params: { itemId: value },
          search: {
            filter: 'all',
            page: currentIndex % 25,
            q: `item-${value}`,
          },
          replace: true,
        })
      } else if (step === 1) {
        await navigateAndWait({
          to: '/search',
          search: {
            filter: 'active',
            page: currentIndex % 50,
            q: `search-${value}`,
          },
          replace: true,
        })
      } else if (step === 2) {
        await navigateAndWait({
          to: '/nested/$a/$b/$c',
          params: { a: `a-${value}`, b: `b-${value}`, c: `c-${value}` },
          search: {
            filter: 'nested',
            page: currentIndex % 75,
            q: `nested-${value}`,
          },
          replace: true,
        })
      } else {
        await navigateAndWait({
          to: '/',
          search: {
            filter: 'home',
            page: currentIndex % 100,
            q: `home-${value}`,
          },
          replace: true,
        })
      }
    }

    await navigateAndWait({
      to: '/',
      search: { filter: 'stable', page: 0, q: 'stable' },
      replace: true,
    })
  },
}

const rootElement = document.getElementById('app')
if (!rootElement) {
  throw new Error('Root element `#app` not found')
}

ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />)
