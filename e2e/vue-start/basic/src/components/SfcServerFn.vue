<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createIsomorphicFn, createServerFn } from '@tanstack/vue-start'

// The handler stays on the server: its text never reaches the client.
const getSecret = createServerFn().handler(async () => 'vue-sfc-server-secret')
const where = createIsomorphicFn()
  .server(() => 'vue-sfc-server-implementation')
  .client(() => 'client')

const result = ref('pending')
const ran = ref('pending')
onMounted(async () => {
  result.value = await getSecret()
  ran.value = where()
})
</script>

<template>
  <div class="p-2">
    <p data-testid="sfc-server-fn">{{ result }}</p>
    <p data-testid="sfc-isomorphic">{{ ran }}</p>
  </div>
</template>
