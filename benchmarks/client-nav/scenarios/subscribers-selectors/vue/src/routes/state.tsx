import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import {
  normalizeSubscriberSearch,
  subscriberGroupSize,
  subscriberIndices,
  subscribersSelectorsScenarioSlug,
} from '../../../shared'
import { RouterStateSubscribers } from '../routerStateSubscribers'
import { SubscriberValue } from '../subscriberValue'
import { rootRoute } from './__root'

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

export const stateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/state',
  validateSearch: normalizeSubscriberSearch,
  component: StateLayout,
})
