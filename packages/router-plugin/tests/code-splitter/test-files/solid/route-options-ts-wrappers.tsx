import { createFileRoute } from '@tanstack/solid-router'
import { fetchPosts } from '../posts'
import type { Component } from 'solid-js'
import type { RouteOptions } from '../types'

export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  component: PostsComponent satisfies Component,
  errorComponent: ErrorComponent!,
  notFoundComponent: (() => <div class="p-2">not found</div>) satisfies Component,
} satisfies RouteOptions)

function PostsComponent() {
  return <div class="p-2">{Route.useLoaderData()().length}</div>
}

function ErrorComponent() {
  return <div class="p-2">error</div>
}
