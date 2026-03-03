import * as Vue from 'vue'
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
} from '@tanstack/vue-router'

function runPerfSelectorComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 50; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

const selectors = Array.from({ length: 20 }, (_, index) => index)

const Params = Vue.defineComponent({
  setup() {
    const number = useParams({
      strict: false,
      select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
    })

    return () => runPerfSelectorComputation(number.value)
  },
})

const Search = Vue.defineComponent({
  setup() {
    const number = useSearch({
      strict: false,
      select: (search) => runPerfSelectorComputation(Number(search.id ?? 0)),
    })

    return () => runPerfSelectorComputation(number.value)
  },
})

const Match = Vue.defineComponent({
  setup() {
    const number = useMatch({
      strict: false,
      select: (match) =>
        runPerfSelectorComputation(Number(match.params.id ?? 0)),
    })

    return () => runPerfSelectorComputation(number.value)
  },
})

const Links = Vue.defineComponent({
  setup() {
    return () => (
      <Link to="/$id" params={{ id: '0' }} search={{ id: '0' }}>
        Link
      </Link>
    )
  },
})

const Root = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {selectors.map((selector) => (
          <Params key={`params-${selector}`} />
        ))}
        {selectors.map((selector) => (
          <Search key={`search-${selector}`} />
        ))}
        {selectors.map((selector) => (
          <Links key={`link-${selector}`} />
        ))}
        {selectors.map((selector) => (
          <Match key={`match-${selector}`} />
        ))}
        <Outlet />
      </>
    )
  },
})

const root = createRootRoute({
  component: Root,
})

const route = createRoute({
  getParentRoute: () => root,
  path: '/$id',
  validateSearch: (search) => ({ id: search.id }),
  component: () => <div />,
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
  })

  const component = <RouterProvider router={router} />

  return { router, component }
}
