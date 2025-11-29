<script setup lang="ts">
import type { PostType } from '../../posts'

const props = defineProps<{
  post: PostType
}>()
</script>

<template>
  <div class="space-y-2">
    <h4 class="text-xl font-bold">{{ props.post.title }}</h4>
    <hr class="opacity-20" />
    <div class="text-sm">{{ props.post.body }}</div>
  </div>
</template>
