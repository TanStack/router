<script lang="ts">
import { createServerFn } from '@tanstack/vue-start'

// A server fn is created once, when its module loads: it lives in the
// component's plain <script> block, not in <script setup>, which runs for
// every instance. The handler stays on the server: its text never reaches
// the client.
const getSecret = createServerFn().handler(async () => 'vue-sfc-server-secret')
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createIsomorphicFn } from '@tanstack/vue-start'

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
