import * as Vue from 'vue'
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
} from '@tanstack/vue-router'
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

const SubscriberValue = Vue.defineComponent({
  props: {
    kind: {
      type: String as Vue.PropType<SubscriberCounterKey>,
      required: true,
    },
    index: {
      type: Number,
      required: true,
    },
    value: {
      type: Function as Vue.PropType<() => unknown>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      recordSubscriberUpdate(props.kind)

      return (
        <span data-subscriber-kind={props.kind}>
          {runSubscriberComputation(
            digestSubscriberValue(props.value()) + props.index,
          )}
        </span>
      )
    }
  },
})

const RouterPathSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useRouterState({
      select: (state) => state.location.pathname.length,
    })

    return () => (
      <SubscriberValue
        kind="routerPath"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterStatusSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useRouterState({
      select: (state) => ({
        status: state.status,
        loading: state.isLoading,
      }),
    })

    return () => (
      <SubscriberValue
        kind="routerStatus"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterHashSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useRouterState({
      select: (state) => state.location.hash,
    })

    return () => (
      <SubscriberValue
        kind="routerHash"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterSearchObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
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

    return () => (
      <SubscriberValue
        kind="routerSearchObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const RouterStateSubscribers = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {subscriberIndices.routerState.map((index) => {
          const group = index % 4

          if (group === 0) {
            return <RouterPathSubscriber key={index} index={index} />
          }

          if (group === 1) {
            return <RouterStatusSubscriber key={index} index={index} />
          }

          if (group === 2) {
            return <RouterHashSubscriber key={index} index={index} />
          }

          return <RouterSearchObjectSubscriber key={index} index={index} />
        })}
      </>
    )
  },
})

const SearchSelectedSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = stateRoute.useSearch({
      select: (search) => search.selected,
    })

    return () => (
      <SubscriberValue
        kind="searchSelected"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const SearchObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = stateRoute.useSearch({
      select: (search) => ({
        mode: search.mode,
        objectKey: search.objectKey,
      }),
    })

    return () => (
      <SubscriberValue
        kind="searchObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const SearchStableSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = stateRoute.useSearch({
      select: (search) => search.stable,
    })

    return () => (
      <SubscriberValue
        kind="searchStable"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const SearchModeSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = stateRoute.useSearch({
      select: (search) => search.mode.length + search.objectKey,
    })

    return () => (
      <SubscriberValue
        kind="searchMode"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const SearchSubscribers = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {subscriberIndices.search.map((index) => {
          if (index < subscriberGroupSize) {
            return <SearchSelectedSubscriber key={index} index={index} />
          }

          if (index < subscriberGroupSize * 2) {
            return <SearchObjectSubscriber key={index} index={index} />
          }

          if (index < subscriberGroupSize * 3) {
            return <SearchStableSubscriber key={index} index={index} />
          }

          return <SearchModeSubscriber key={index} index={index} />
        })}
      </>
    )
  },
})

const ParamSectionSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useParams({
      strict: false,
      select: (params) => stringToSubscriberSeed(String(params.section ?? '')),
    })

    return () => (
      <SubscriberValue
        kind="paramSection"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const ParamItemSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useParams({
      strict: false,
      select: (params) => stringToSubscriberSeed(String(params.itemId ?? '')),
    })

    return () => (
      <SubscriberValue
        kind="paramItem"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const ParamObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useParams({
      strict: false,
      select: (params) => ({
        section: String(params.section ?? ''),
        itemId: String(params.itemId ?? ''),
      }),
    })

    return () => (
      <SubscriberValue
        kind="paramObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const ParamSubscribers = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {subscriberIndices.params.map((index) => {
          if (index < subscriberGroupSize * 2) {
            return <ParamSectionSubscriber key={index} index={index} />
          }

          if (index < subscriberGroupSize * 3) {
            return <ParamItemSubscriber key={index} index={index} />
          }

          return <ParamObjectSubscriber key={index} index={index} />
        })}
      </>
    )
  },
})

const MatchesDepthSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useMatches({
      select: (matches) => matches.length,
    })

    return () => (
      <SubscriberValue
        kind="matchesDepth"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const MatchObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = itemRoute.useMatch({
      select: (match) => ({
        id: match.id,
        section: String(match.params.section ?? ''),
        itemId: String(match.params.itemId ?? ''),
      }),
    })

    return () => (
      <SubscriberValue
        kind="matchObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const MatchSubscribers = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {subscriberIndices.matches.map((index) => {
          if (index < subscriberGroupSize) {
            return <MatchesDepthSubscriber key={index} index={index} />
          }

          return <MatchObjectSubscriber key={index} index={index} />
        })}
      </>
    )
  },
})

const Root = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const StateLayout = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <div data-client-nav-scenario={subscribersSelectorsScenarioSlug} />
        <RouterStateSubscribers />
        <SearchSubscribers />
        <Outlet />
      </>
    )
  },
})

const SectionLayout = Vue.defineComponent({
  setup() {
    return () => <Outlet />
  },
})

const ItemPage = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <ParamSubscribers />
        <MatchSubscribers />
      </>
    )
  },
})

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

declare module '@tanstack/vue-router' {
  interface Register {
    router: ReturnType<typeof createSubscribersSelectorsRouter>
  }
}

export function mountTestApp(container: Element) {
  const router = createSubscribersSelectorsRouter()
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
