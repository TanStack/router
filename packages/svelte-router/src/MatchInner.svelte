<script lang="ts">
  import { SvelteComponent } from "svelte"
  import Outlet from './Outlet.svelte'
  import { AnyRoute } from "./index"
import {
  pick,
} from '@tanstack/router-core'
  import { useRouter, useRouterState } from "./hooks"

  export let PendingComponent: typeof SvelteComponent 
  export let route: AnyRoute
  export let matchId: string

  const routerStore = useRouter()
  $: router = $routerStore

  $: CurrentComponent = route.options.component ?? router.options.defaultComponent


  const matchStore = useRouterState({
    select: (d) => {
      const match = d.matchesById[matchId]
      return pick(match!, ['status', 'loadPromise', 'routeId', 'error'])
    },
  })

  $: match = $matchStore

  if (match.status === 'error') {
    throw match.error
  }
  $: routeProps = {
        useLoader: route.useLoader,
        useMatch: route?.useMatch,
        useContext: route.useContext,
        useRouteContext: route.useRouteContext,
        useSearch: route.useSearch,
        useParams: route.useParams,
      }
</script>
          {#if match.status === 'success'}
            {#if CurrentComponent}
              <svelte:component this={CurrentComponent} {...routeProps} />
            {:else}
              <Outlet />
            {/if}
          {:else if match.status === 'pending'}
            <PendingComponent />
          {/if}
