import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import PostsIndexComponent from './-components/PostsIndexComponent.vue'

export const Route = createFileRoute('/posts/')({
  component: () => h(PostsIndexComponent),
})
