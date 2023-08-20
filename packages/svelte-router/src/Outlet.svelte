<script lang="ts">
  import { getMatchIdsStore } from './hooks'
  import Match from './Match.svelte'
  const matchIdsStore = getMatchIdsStore()
  const matchIds = $matchIdsStore.slice(1)
</script>

{#if matchIds[0]}
  <Match matchIds={matchIds} />
{/if}

  
