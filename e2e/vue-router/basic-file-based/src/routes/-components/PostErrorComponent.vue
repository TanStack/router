<script setup lang="ts">
import { NotFoundError } from '../../posts'

const props = defineProps<{
  error: Error
}>()
</script>

<template>
  <div v-if="props.error instanceof NotFoundError">
    {{ props.error.message }}
  </div>
  <div v-else>An error occurred: {{ props.error.message }}</div>
</template>
