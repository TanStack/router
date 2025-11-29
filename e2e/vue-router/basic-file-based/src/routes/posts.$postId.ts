import { h, type VNode } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { fetchPost, type PostType } from '../posts'
import PostComponentVue from './-components/PostComponent.vue'
import PostErrorComponentVue from './-components/PostErrorComponent.vue'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
  component: PostRouteComponent,
  errorComponent: PostErrorRouteComponent,
})

function PostRouteComponent(): VNode {
  const post = Route.useLoaderData() as { value: PostType }
  return h(PostComponentVue, { post: post.value })
}

function PostErrorRouteComponent({ error }: { error: Error }): VNode {
  return h(PostErrorComponentVue, { error })
}
