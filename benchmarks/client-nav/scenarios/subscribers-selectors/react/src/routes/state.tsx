import { Outlet, createRoute } from '@tanstack/react-router'
import {
  normalizeSubscriberSearch,
  subscriberGroupSize,
  subscriberIndices,
  subscribersSelectorsScenarioSlug,
} from '../../../shared'
import { RouterStateSubscribers } from '../routerStateSubscribers'
import { SubscriberValue } from '../subscriberValue'
import { rootRoute } from './__root'

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
    structuralSharing: true,
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

export const stateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/state',
  validateSearch: normalizeSubscriberSearch,
  component: StateLayout,
})
