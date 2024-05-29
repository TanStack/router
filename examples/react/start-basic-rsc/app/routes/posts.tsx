// import * as React from 'react'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { fetchPosts } from '../utils/posts'
import { createServerFn } from '@tanstack/start'
import { test } from '~/utils/renderPosts'

export const renderPosts = createServerFn('GET', test)
export const Route = createFileRoute('/posts')({
  loader: async () => renderPosts(),
  component: PostsComponent,
})

function PostsComponent() {
  return null
  // return Route.useLoaderData()
}
