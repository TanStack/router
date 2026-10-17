import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../posts'

export const Route = createFileRoute('/posts')({
  loader() {
    return fetchPosts()
  },
  component() {
    const posts = Route.useLoaderData()

    return <div>{posts.length} posts</div>
  },
  errorComponent() {
    return <div>Failed to load posts</div>
  },
})
