<template>
  <div class="p-2 flex gap-2">
    <ul class="list-disc pl-4">
      <li 
        v-for="post in postsWithNonExistent" 
        :key="post.id"
        class="whitespace-nowrap"
      >
        <Link
          to="/posts/$postId"
          :params="{
            postId: post.id,
          }"
          class="block py-1 text-blue-600 hover:opacity-75"
          :active-props="{ class: 'font-bold underline' }"
        >
          <div>{{ post.title.substring(0, 20) }}</div>
        </Link>
      </li>
    </ul>
    <hr>
    <Outlet />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Link, Outlet } from '@tanstack/vue-router'

const props = defineProps<{
  posts: { value: Array<{ id: string; title: string }> }
}>()

const postsWithNonExistent = computed(() => [
  ...props.posts.value, 
  { id: 'i-do-not-exist', title: 'Non-existent Post' }
])
</script> 