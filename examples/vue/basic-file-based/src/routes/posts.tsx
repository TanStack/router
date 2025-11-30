import {  h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { fetchPosts } from '../posts'
import PostsComponentVue from '../components/PostsComponent.vue'
import type {VNode} from 'vue';

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: PostsComponent,
})

function PostsComponent(): VNode {
  const posts = Route.useLoaderData()
  
  // Pass the posts data to the Vue component
  return h(PostsComponentVue, { posts })
}
