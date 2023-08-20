<script lang="ts">
import warning from 'tiny-warning'
    import ErrorComponent from "./ErrorComponent.svelte"
    import { useRouter, useRouterState } from "./hooks"
    import CatchBoundary from './CatchBoundary.svelte'
    import SafeFragment from './SafeFragment.svelte'
    import Suspense from './Suspense.svelte'
    import Outlet from './Outlet.svelte'

import {
  pick,
} from '@tanstack/router-core'
    export let matchIds: string[]
    const defaultPending = () => null

  const routerStore = useRouter()
  const matchId = matchIds[0]!
  $: router = $routerStore
  $: routeId = router.getRouteMatch(matchId)!.routeId
  $: route = router.getRoute(routeId)

  const PendingComponent = (route.options.pendingComponent ??
    router.options.defaultPendingComponent ??
    defaultPending) as any

  const errorComponent =
    route.options.errorComponent ??
    router.options.defaultErrorComponent ??
    ErrorComponent

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ?? !route.isRoot
      ? Suspense
      : SafeFragment

  const ResolvedCatchBoundary = !!errorComponent ? CatchBoundary : SafeFragment

  const matchStore = useRouterState({
    select: (d) => {
      const match = d.matchesById[matchId]
      return pick(match!, ['status', 'loadPromise', 'routeId', 'error'])
    },
  })

  $: match = $matchStore
  $: CurrentComponent = route.options.component ?? router.options.defaultComponent

  if (match.status === 'error') {
    throw match.error
  }
  $: routeProps = {
        useLoader: route.useLoader,
        useMatch: route.useMatch,
        useContext: route.useContext,
        useRouteContext: route.useRouteContext,
        useSearch: route.useSearch,
        useParams: route.useParams,
      }
</script>
      <ResolvedSuspenseBoundary
        fallbackElement={PendingComponent}
        fallbackProps={routeProps}
      >
        <ResolvedCatchBoundary
          errorComponent={errorComponent}
          onCatch={() => {
            warning(false, `Error in route match: ${matchId}`)
          }}
        >
          {#if match.status === 'success'}
            {#if CurrentComponent}
              <svelte:component this={CurrentComponent} {...routeProps} />
            {:else}
              <Outlet />
            {/if}
          {:else if match.status === 'pending'}
            <PendingComponent />
          {/if}
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
