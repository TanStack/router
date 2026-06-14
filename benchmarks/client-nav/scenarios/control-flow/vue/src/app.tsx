import * as Vue from 'vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useParams,
} from '@tanstack/vue-router'
import {
  ERROR_MARKER,
  INITIAL_CONTROL_FLOW_PATH,
  NOT_FOUND_MARKER,
  SEARCH_ERROR_MARKER,
  START_MARKER,
  UNMATCHED_MARKER,
  createShallowControlFlowError,
  normalizeFlowId,
  validateControlFlowSearch,
  type ControlFlowBranch,
  type ControlFlowSearch,
} from '../../shared'

type MarkerProps = {
  branch: ControlFlowBranch
  value: string
  checksum?: number
}

type FlowParams = {
  id: string
}

function createControlFlowMarkerElement(props: MarkerProps) {
  return (
    <main
      data-control-flow-branch={props.branch}
      data-control-flow-value={props.value}
      data-control-flow-checksum={props.checksum}
    />
  )
}

function parseFlowParams(params: { id: string }) {
  return {
    id: normalizeFlowId(params.id),
  }
}

function stringifyFlowParams(params: FlowParams) {
  return {
    id: normalizeFlowId(params.id),
  }
}

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const RootNotFoundComponent = Vue.defineComponent({
  setup() {
    return () => createControlFlowMarkerElement(UNMATCHED_MARKER)
  },
})

const RootErrorComponent = Vue.defineComponent({
  setup() {
    return () =>
      createControlFlowMarkerElement({ branch: 'error', value: 'root' })
  },
})

const StartPage = Vue.defineComponent({
  setup() {
    return () => (
      <main
        data-control-flow-branch={START_MARKER.branch}
        data-control-flow-value={START_MARKER.value}
      >
        <nav>
          <Link
            data-testid="control-flow-target-link"
            to="/flow/target/$id"
            params={{ id: 'link-target' }}
            replace
          >
            Target
          </Link>
          <Link
            data-testid="control-flow-before-load-link"
            to="/flow/redirect-before-load/$id"
            params={{ id: 'link-before-load' }}
            replace
          >
            Before load redirect
          </Link>
          <Link
            data-testid="control-flow-loader-redirect-link"
            to="/flow/redirect-loader/$id"
            params={{ id: 'link-loader' }}
            replace
          >
            Loader redirect
          </Link>
          <Link
            data-testid="control-flow-not-found-link"
            to="/flow/not-found/$id"
            params={{ id: 'link-missing' }}
            replace
          >
            Not found
          </Link>
          <Link
            data-testid="control-flow-error-link"
            to="/flow/error/$id"
            params={{ id: 'link-error' }}
            replace
          >
            Error
          </Link>
          <Link
            data-testid="control-flow-search-link"
            to="/flow/search"
            search={{ mode: 'valid', token: 'link-valid' }}
            replace
          >
            Search
          </Link>
          <a
            data-testid="control-flow-invalid-search-link"
            href="/flow/search?mode=invalid&token=link-invalid"
          >
            Invalid search
          </a>
          <a
            data-testid="control-flow-unmatched-link"
            href="/flow/unmatched/link"
          >
            Unmatched
          </a>
        </nav>
      </main>
    )
  },
})

const TargetPage = Vue.defineComponent({
  setup() {
    const params = useParams({
      strict: false,
      select: (allParams) => ({
        id: normalizeFlowId((allParams as { id?: unknown }).id),
      }),
    }) as Vue.Ref<FlowParams>

    return () =>
      createControlFlowMarkerElement({
        branch: 'target',
        value: params.value.id,
      })
  },
})

const EmptyPage = Vue.defineComponent({
  setup() {
    return () => null
  },
})

const NotFoundPage = Vue.defineComponent({
  setup() {
    return () => createControlFlowMarkerElement(NOT_FOUND_MARKER)
  },
})

const ErrorPage = Vue.defineComponent({
  setup() {
    return () => createControlFlowMarkerElement(ERROR_MARKER)
  },
})

const SearchErrorPage = Vue.defineComponent({
  setup() {
    return () => createControlFlowMarkerElement(SEARCH_ERROR_MARKER)
  },
})

const SearchPage = Vue.defineComponent({
  setup() {
    const search = searchRoute.useSearch() as Vue.Ref<ControlFlowSearch>

    return () =>
      createControlFlowMarkerElement({
        branch: 'search-valid',
        value: search.value.token,
        checksum: search.value.checksum,
      })
  },
})

const FallbackPage = Vue.defineComponent({
  setup() {
    return () => createControlFlowMarkerElement(UNMATCHED_MARKER)
  },
})

const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: RootNotFoundComponent,
  errorComponent: RootErrorComponent,
})

const startRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/start',
  component: StartPage,
})

const targetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/target/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  component: TargetPage,
})

const redirectBeforeLoadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/redirect-before-load/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/flow/target/$id',
      params: { id: params.id },
      replace: true,
    })
  },
  component: EmptyPage,
})

const redirectLoaderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/redirect-loader/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: ({ params }) => {
    throw redirect({
      to: '/flow/target/$id',
      params: { id: params.id },
      replace: true,
    })
  },
  component: EmptyPage,
})

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/not-found/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: () => {
    throw notFound()
  },
  notFoundComponent: NotFoundPage,
  component: EmptyPage,
})

const errorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/error/$id',
  params: {
    parse: parseFlowParams,
    stringify: stringifyFlowParams,
  },
  loader: ({ params }) => {
    throw createShallowControlFlowError('loader', params.id)
  },
  errorComponent: ErrorPage,
  component: EmptyPage,
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/search',
  validateSearch: validateControlFlowSearch,
  errorComponent: SearchErrorPage,
  component: SearchPage,
})

const fallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/$',
  component: FallbackPage,
})

const routeTree = rootRoute.addChildren([
  startRoute,
  targetRoute,
  redirectBeforeLoadRoute,
  redirectLoaderRoute,
  notFoundRoute,
  errorRoute,
  searchRoute,
  fallbackRoute,
])

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: [INITIAL_CONTROL_FLOW_PATH],
    }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    routeTree,
  })
  const component = <RouterProvider router={router} />
  const app = Vue.createApp({
    render: () => component,
  })
  let didUnmount = false

  app.mount(container)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
