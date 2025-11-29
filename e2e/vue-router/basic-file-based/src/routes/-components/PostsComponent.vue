<script setup lang="ts">
import { Link, Outlet } from '@tanstack/vue-router'
import type { PostType } from '../../posts'

const props = defineProps<{
  posts: Array<PostType>
}>()
</script>

<template>
  <div class="p-2 flex gap-2">
    <ul class="list-disc pl-4">
      <li
        v-for="post in [...props.posts, { id: 'i-do-not-exist', title: 'Non-existent Post' }]"
        :key="post.id"
        class="whitespace-nowrap"
      >
        <Link
          to="/posts/$postId"
          :params="{ postId: post.id }"
          class="block py-1 px-2 text-blue-600 hover:opacity-75"
          :activeProps="{ class: 'font-bold underline' }"
        >
          <div>{{ post.title.substring(0, 20) }}</div>
        </Link>
      </li>
    </ul>
    <Outlet />
  </div>
</template>
