import { For, createRenderEffect } from 'solid-js'
import { render } from '@solidjs/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
  useParams,
  useSearch,
} from '@tanstack/solid-router'
import type { JSX } from '@solidjs/web'

function runPerfSelectorComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 40; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

function normalizePage(value: unknown) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1
}

function normalizeFilter(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : 'all'
}

const noop = () => {}
const rootSelectors = Array.from({ length: 10 }, (_, index) => index)
const routeSelectors = Array.from({ length: 6 }, (_, index) => index)
const linkGroups = Array.from({ length: 4 }, (_, index) => index)

function BasicLink(props: {
  children: JSX.Element
  'data-testid'?: string
  from?: string
  to: string
  params?: unknown
  search?: unknown
  replace?: boolean
}) {
  const router = useRouter()

  const handleClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return
    }

    event.preventDefault()
    router.navigate({
      from: props.from as never,
      to: props.to as never,
      params: props.params as never,
      search: props.search as never,
      replace: props.replace,
    })
  }

  return (
    <a data-testid={props['data-testid']} href="#" onClick={handleClick}>
      {props.children}
    </a>
  )
}

function PerfValue(props: { value: () => number }) {
  createRenderEffect(
    () => props.value(),
    () => {},
  )

  return null
}

function RootParamsSubscriber() {
  const params = useParams({
    strict: false,
    select: (params) => runPerfSelectorComputation(Number(params.id ?? 0)),
  })

  return <PerfValue value={() => runPerfSelectorComputation(params())} />
}

function RootSearchSubscriber() {
  const search = useSearch({
    strict: false,
    select: (search) => runPerfSelectorComputation(Number(search.page ?? 0)),
  })

  return <PerfValue value={() => runPerfSelectorComputation(search())} />
}

function LinkPanel() {
  return (
    <>
      <For each={linkGroups}>
        {(groupIndexAccessor) => {
          const groupIndex = groupIndexAccessor()
          const itemsId = groupIndex === 0 ? 1 : groupIndex + 2
          const ctxId = groupIndex + 1

          return (
            <div>
              <BasicLink
                data-testid={groupIndex === 0 ? 'go-items-1' : undefined}
                to="/items/$id"
                params={{ id: itemsId }}
                replace
              >
                {`Items ${itemsId}`}
              </BasicLink>
              <BasicLink
                data-testid={groupIndex === 0 ? 'go-items-2' : undefined}
                to="/items/$id"
                params={{ id: 2 }}
                replace
              >
                {`Items 2 alt ${groupIndex}`}
              </BasicLink>
              <BasicLink
                data-testid={groupIndex === 0 ? 'go-search' : undefined}
                to="/search"
                search={{ page: 1, filter: 'all', junk: `group-${groupIndex}` }}
                replace
              >
                {`Search ${groupIndex}`}
              </BasicLink>
              <BasicLink
                data-testid={groupIndex === 0 ? 'go-ctx' : undefined}
                to="/ctx/$id"
                params={{ id: ctxId }}
                search={true}
                replace
              >
                {`Context ${ctxId}`}
              </BasicLink>
              <BasicLink
                from={searchRoute.fullPath}
                to="/search"
                search={(prev: { page: number; filter: string }) => ({
                  page: prev.page + groupIndex + 1,
                  filter: prev.filter,
                  junk: `updater-${groupIndex}`,
                })}
              >
                {`Search updater ${groupIndex}`}
              </BasicLink>
            </div>
          )
        }}
      </For>
    </>
  )
}

function Root() {
  return (
    <>
      <For each={rootSelectors}>{() => <RootParamsSubscriber />}</For>
      <For each={rootSelectors}>{() => <RootSearchSubscriber />}</For>
      <LinkPanel />
      <Outlet />
    </>
  )
}

const rootRoute = createRootRoute({
  component: Root,
})

const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  params: {
    parse: (params) => ({
      ...params,
      id: normalizePage(params.id),
    }),
    stringify: (params) => ({
      ...params,
      id: `${params.id}`,
    }),
  },
  onEnter: noop,
  onStay: noop,
  onLeave: noop,
  component: ItemsPage,
})

const itemDetailsRoute = createRoute({
  getParentRoute: () => itemsRoute,
  path: 'details',
  component: ItemDetailsPage,
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>) => ({
    page: normalizePage(search.page),
    filter: normalizeFilter(search.filter),
  }),
  search: {
    middlewares: [
      ({ search, next }) => {
        const result = next(search)
        return {
          page: result.page,
          filter: result.filter,
        }
      },
    ],
  },
  loaderDeps: ({ search }) => ({
    page: search.page,
    filter: search.filter,
  }),
  loader: ({ deps }) => ({
    seed: deps.page * 31 + deps.filter.length,
    checksum: deps.page * 17 + deps.filter.length,
  }),
  staleTime: 60_000,
  gcTime: 60_000,
  component: SearchPage,
})

const contextRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ctx/$id',
  beforeLoad: ({ params }) => ({
    sectionSeed: Number(params.id) * 13 + 1,
  }),
  component: ContextPage,
})

function ItemParamsSubscriber() {
  const params = itemsRoute.useParams({
    select: (params) => runPerfSelectorComputation(params.id),
  })

  return <PerfValue value={() => runPerfSelectorComputation(params())} />
}

function SearchStateSubscriber() {
  const search = searchRoute.useSearch({
    select: (search) =>
      runPerfSelectorComputation(search.page + search.filter.length),
  })

  return <PerfValue value={() => runPerfSelectorComputation(search())} />
}

function SearchLoaderDepsSubscriber() {
  const loaderDeps = searchRoute.useLoaderDeps({
    select: (loaderDeps) =>
      runPerfSelectorComputation(loaderDeps.page + loaderDeps.filter.length),
  })

  return <PerfValue value={() => runPerfSelectorComputation(loaderDeps())} />
}

function SearchLoaderDataSubscriber() {
  const loaderData = searchRoute.useLoaderData({
    select: (loaderData) =>
      runPerfSelectorComputation(loaderData.seed + loaderData.checksum),
  })

  return <PerfValue value={() => runPerfSelectorComputation(loaderData())} />
}

function ContextParamsSubscriber() {
  const params = contextRoute.useParams({
    select: (params) => runPerfSelectorComputation(Number(params.id)),
  })

  return <PerfValue value={() => runPerfSelectorComputation(params())} />
}

function ContextRouteSubscriber() {
  const context = contextRoute.useRouteContext({
    select: (context) => runPerfSelectorComputation(context.sectionSeed),
  })

  return <PerfValue value={() => runPerfSelectorComputation(context())} />
}

function ItemsPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <ItemParamsSubscriber />}</For>
      <BasicLink
        data-testid="items-details"
        from={itemsRoute.fullPath}
        to="./details"
        replace
      >
        Details
      </BasicLink>
      <BasicLink
        from={itemsRoute.fullPath}
        to="."
        search={true}
      >
        Preserve search on item
      </BasicLink>
      <Outlet />
    </>
  )
}

function ItemDetailsPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <ItemParamsSubscriber />}</For>
      <BasicLink
        data-testid="items-parent"
        from={itemDetailsRoute.fullPath}
        to=".."
        replace
      >
        Back to item
      </BasicLink>
    </>
  )
}

function SearchPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <SearchStateSubscriber />}</For>
      <For each={routeSelectors}>{() => <SearchLoaderDepsSubscriber />}</For>
      <For each={routeSelectors}>{() => <SearchLoaderDataSubscriber />}</For>
      <BasicLink
        data-testid="search-next-page"
        from={searchRoute.fullPath}
        to="."
        replace
        search={(prev: { page: number; filter: string }) => ({
          page: prev.page + 1,
          filter: prev.filter,
          junk: 'local-updater',
        })}
      >
        Next page
      </BasicLink>
    </>
  )
}

function ContextPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <ContextParamsSubscriber />}</For>
      <For each={routeSelectors}>{() => <ContextRouteSubscriber />}</For>
    </>
  )
}

export function mountTestApp(container: Element) {
  const router = createRouter({
    history: createMemoryHistory({
      initialEntries: ['/items/0'],
    }),
    scrollRestoration: true,
    routeTree: rootRoute.addChildren([
      itemsRoute.addChildren([itemDetailsRoute]),
      searchRoute,
      contextRoute,
    ]),
  })

  const unmount = render(() => <RouterProvider router={router} />, container)

  return {
    router,
    unmount,
  }
}
