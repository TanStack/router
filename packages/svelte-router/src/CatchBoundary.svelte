<script lang="ts">
    import { useRouterState } from "./hooks"
    import ErrorComponent from "./ErrorComponent.svelte"


export let errorComponent = ErrorComponent
export let onCatch: (error: any, info: any) => void


let error = false
let info: undefined

  const locationKey = useRouterState({
    select: (d) => d.resolvedLocation.key,
  })

const resetProps = (_locationKey?: string) => {
error = false
info = undefined
}

$: resetProps($locationKey)
// There's no standard svelte way to catch errors in svelte 4 yet 
// (will be introduced in svelte 5)
window.onerror = (error: any, info: any) => {
  onCatch(error, info)
  error = error
  info = info
}
</script>

{#if error}
  <svelte:component this={errorComponent} { error }/>
{:else}
<slot/>
{/if}
