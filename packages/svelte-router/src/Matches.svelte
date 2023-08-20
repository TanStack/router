<script lang="ts">
  import { readable } from "svelte/store"
  import { registerMatchesContext, useRouter, useRouterState } from "./hooks"
  import warning from 'tiny-warning'
  import CatchBoundary from './CatchBoundary.svelte'
  import ErrorComponent from './ErrorComponent.svelte'
  import Outlet from './Outlet.svelte'
  const router = useRouter()

  const matchIds = useRouterState({
    select: (state) => {
      const hasPendingComponent = state.pendingMatches.some((d: {routeId: string}) => {
        const route = $router.getRoute(d.routeId as any)
        return !!route?.options.pendingComponent
      })

      if (hasPendingComponent) {
        console.log('hasPending')
        return state.pendingMatchIds
      }

      return state.matchIds
    },
  })

  const matchIdsStore = readable([undefined!, ...$matchIds])
  registerMatchesContext(matchIdsStore)
</script>

  <CatchBoundary
    errorComponent={ErrorComponent}
    onCatch={() => {
      warning(
        false,
        `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`,
      )
    }}
  >
    <Outlet />
  </CatchBoundary>
