import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
import { PostsComponent } from '../posts-component'

type PostsData = Awaited<ReturnType<typeof fetchPosts>>
type PostsProps = Parameters<typeof PostsComponent>[0]

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: PostsComponent,
})
