import { render } from 'solid-js/web'
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
} from '@tanstack/solid-router'
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

function ControlFlowMarker(props: MarkerProps) {
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

function Root() {
  return <Outlet />
}

function RootNotFoundComponent() {
  return <ControlFlowMarker {...UNMATCHED_MARKER} />
}

function RootErrorComponent() {
  return <ControlFlowMarker branch="error" value="root" />
}

function StartPage() {
  return (
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
}

function TargetPage() {
  const params = targetRoute.useParams()

  return <ControlFlowMarker branch="target" value={params().id} />
}

function EmptyPage() {
  return null
}

function NotFoundPage() {
  return <ControlFlowMarker {...NOT_FOUND_MARKER} />
}

function ErrorPage() {
  return <ControlFlowMarker {...ERROR_MARKER} />
}

function SearchErrorPage() {
  return <ControlFlowMarker {...SEARCH_ERROR_MARKER} />
}

function SearchPage() {
  const search = searchRoute.useSearch() as () => ControlFlowSearch

  return (
    <ControlFlowMarker
      branch="search-valid"
      value={search().token}
      checksum={search().checksum}
    />
  )
}

function FallbackPage() {
  return <ControlFlowMarker {...UNMATCHED_MARKER} />
}

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
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
