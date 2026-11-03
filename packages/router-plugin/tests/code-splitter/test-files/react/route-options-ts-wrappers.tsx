import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'
import type { FC } from 'react'
import type { RouteOptions } from '../types'

export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: PostsComponent satisfies FC,
  errorComponent: ErrorComponent!,
  notFoundComponent: (() => <div className="p-2">not found</div>) satisfies FC,
} satisfies RouteOptions)

function PostsComponent() {
  return <div className="p-2">{Route.useLoaderData().length}</div>
}

function ErrorComponent() {
  return <div className="p-2">error</div>
}
