<script setup lang="ts">
import { useRouterState } from '@tanstack/vue-router'
import { NotFoundError } from '../posts'

const routerState = useRouterState()
const error = routerState.value.error as Error | undefined
</script>

<template>
  <div v-if="error instanceof NotFoundError">
    {{ error.message }}
  </div>
  <div v-else-if="error">An error occurred: {{ error.message }}</div>
</template>
