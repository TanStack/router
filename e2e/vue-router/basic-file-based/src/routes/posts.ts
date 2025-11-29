import { h, type VNode } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { fetchPosts, type PostType } from '../posts'
import PostsComponentVue from './-components/PostsComponent.vue'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: PostsRouteComponent,
})

function PostsRouteComponent(): VNode {
  const posts = Route.useLoaderData() as { value: Array<PostType> }
  return h(PostsComponentVue, { posts: posts.value })
}
