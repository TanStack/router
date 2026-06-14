import { For, createMemo, createRenderEffect } from 'solid-js'
import { render } from 'solid-js/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatches,
  useParams,
  useRouterState,
} from '@tanstack/solid-router'
import {
  createEmptySubscriberCounts,
  digestSubscriberValue,
  normalizeSubscriberSearch,
  runSubscriberComputation,
  stringToSubscriberSeed,
  subscriberGroupSize,
  subscriberIndices,
  subscribersSelectorsInitialLocation,
  subscribersSelectorsScenarioSlug,
} from '../../shared'
import type { SubscriberCounterKey, SubscriberCounts } from '../../shared'

let subscriberCounts = createEmptySubscriberCounts()
let subscriberCountersEnabled = false

export function resetSubscriberCounts() {
  subscriberCounts = createEmptySubscriberCounts()
}

export function getSubscriberCounts(): SubscriberCounts {
  return { ...subscriberCounts }
}

export function setSubscriberCountersEnabled(enabled: boolean) {
  subscriberCountersEnabled = enabled
}

function recordSubscriberUpdate(kind: SubscriberCounterKey) {
  if (subscriberCountersEnabled) {
    subscriberCounts[kind] += 1
  }
}

function SubscriberValue(props: {
  kind: SubscriberCounterKey
  index: number
  value: () => unknown
}) {
  const text = createMemo(() =>
    runSubscriberComputation(
      digestSubscriberValue(props.value()) + props.index,
    ),
  )

  createRenderEffect(() => {
    text()
    recordSubscriberUpdate(props.kind)
  })

  return <span data-subscriber-kind={props.kind}>{text()}</span>
}

function RouterPathSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => state.location.pathname.length,
  })

  return <SubscriberValue kind="routerPath" index={props.index} value={value} />
}

function RouterStatusSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => ({
      status: state.status,
      loading: state.isLoading,
    }),
  })

  return (
    <SubscriberValue kind="routerStatus" index={props.index} value={value} />
  )
}

function RouterHashSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => state.location.hash,
  })

  return <SubscriberValue kind="routerHash" index={props.index} value={value} />
}

function RouterSearchObjectSubscriber(props: { index: number }) {
  const value = useRouterState({
    select: (state) => {
      const search = state.location.search as Partial<{
        mode: string
        objectKey: number
      }>

      return {
        mode: search.mode ?? '',
        objectKey: Number(search.objectKey ?? 0),
      }
    },
  })

  return (
    <SubscriberValue
      kind="routerSearchObject"
      index={props.index}
      value={value}
    />
  )
}

function RouterStateSubscribers() {
  return (
    <For each={subscriberIndices.routerState}>
      {(index) => {
        const group = index % 4

        if (group === 0) {
          return <RouterPathSubscriber index={index} />
        }

        if (group === 1) {
          return <RouterStatusSubscriber index={index} />
        }

        if (group === 2) {
          return <RouterHashSubscriber index={index} />
        }

        return <RouterSearchObjectSubscriber index={index} />
      }}
    </For>
  )
}

function SearchSelectedSubscriber(props: { index: number }) {
  const value = stateRoute.useSearch({
    select: (search) => search.selected,
  })

  return (
    <SubscriberValue kind="searchSelected" index={props.index} value={value} />
  )
}

function SearchObjectSubscriber(props: { index: number }) {
  const value = stateRoute.useSearch({
    select: (search) => ({
      mode: search.mode,
      objectKey: search.objectKey,
    }),
  })

  return (
    <SubscriberValue kind="searchObject" index={props.index} value={value} />
  )
}

function SearchStableSubscriber(props: { index: number }) {
  const value = stateRoute.useSearch({
    select: (search) => search.stable,
  })

  return (
    <SubscriberValue kind="searchStable" index={props.index} value={value} />
  )
}

function SearchModeSubscriber(props: { index: number }) {
  const value = stateRoute.useSearch({
    select: (search) => search.mode.length + search.objectKey,
  })

  return <SubscriberValue kind="searchMode" index={props.index} value={value} />
}

function SearchSubscribers() {
  return (
    <For each={subscriberIndices.search}>
      {(index) => {
        if (index < subscriberGroupSize) {
          return <SearchSelectedSubscriber index={index} />
        }

        if (index < subscriberGroupSize * 2) {
          return <SearchObjectSubscriber index={index} />
        }

        if (index < subscriberGroupSize * 3) {
          return <SearchStableSubscriber index={index} />
        }

        return <SearchModeSubscriber index={index} />
      }}
    </For>
  )
}

function ParamSectionSubscriber(props: { index: number }) {
  const value = useParams({
    strict: false,
    select: (params) => stringToSubscriberSeed(String(params.section ?? '')),
  })

  return (
    <SubscriberValue kind="paramSection" index={props.index} value={value} />
  )
}

function ParamItemSubscriber(props: { index: number }) {
  const value = useParams({
    strict: false,
    select: (params) => stringToSubscriberSeed(String(params.itemId ?? '')),
  })

  return <SubscriberValue kind="paramItem" index={props.index} value={value} />
}

function ParamObjectSubscriber(props: { index: number }) {
  const value = useParams({
    strict: false,
    select: (params) => ({
      section: String(params.section ?? ''),
      itemId: String(params.itemId ?? ''),
    }),
  })

  return (
    <SubscriberValue kind="paramObject" index={props.index} value={value} />
  )
}

function ParamSubscribers() {
  return (
    <For each={subscriberIndices.params}>
      {(index) => {
        if (index < subscriberGroupSize * 2) {
          return <ParamSectionSubscriber index={index} />
        }

        if (index < subscriberGroupSize * 3) {
          return <ParamItemSubscriber index={index} />
        }

        return <ParamObjectSubscriber index={index} />
      }}
    </For>
  )
}

function MatchesDepthSubscriber(props: { index: number }) {
  const value = useMatches({
    select: (matches) => matches.length,
  })

  return (
    <SubscriberValue kind="matchesDepth" index={props.index} value={value} />
  )
}

function MatchObjectSubscriber(props: { index: number }) {
  const value = itemRoute.useMatch({
    select: (match) => ({
      id: match.id,
      section: String(match.params.section ?? ''),
      itemId: String(match.params.itemId ?? ''),
    }),
  })

  return (
    <SubscriberValue kind="matchObject" index={props.index} value={value} />
  )
}

function MatchSubscribers() {
  return (
    <For each={subscriberIndices.matches}>
      {(index) => {
        if (index < subscriberGroupSize) {
          return <MatchesDepthSubscriber index={index} />
        }

        return <MatchObjectSubscriber index={index} />
      }}
    </For>
  )
}

function Root() {
  return <Outlet />
}

function StateLayout() {
  return (
    <>
      <div data-client-nav-scenario={subscribersSelectorsScenarioSlug} />
      <RouterStateSubscribers />
      <SearchSubscribers />
      <Outlet />
    </>
  )
}

function SectionLayout() {
  return <Outlet />
}

function ItemPage() {
  return (
    <>
      <ParamSubscribers />
      <MatchSubscribers />
    </>
  )
}

const rootRoute = createRootRoute({
  component: Root,
})

const stateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/state',
  validateSearch: normalizeSubscriberSearch,
  component: StateLayout,
})

const sectionRoute = createRoute({
  getParentRoute: () => stateRoute,
  path: '$section',
  component: SectionLayout,
})

const itemRoute = createRoute({
  getParentRoute: () => sectionRoute,
  path: '$itemId',
  component: ItemPage,
})

const routeTree = rootRoute.addChildren([
  stateRoute.addChildren([sectionRoute.addChildren([itemRoute])]),
])

function createSubscribersSelectorsRouter() {
  return createRouter({
    history: createMemoryHistory({
      initialEntries: [subscribersSelectorsInitialLocation],
    }),
    routeTree,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createSubscribersSelectorsRouter>
  }
}

export function mountTestApp(container: Element) {
  const router = createSubscribersSelectorsRouter()
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
