// import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, renderRsc } from '@tanstack/start'
import { renderPosts } from '~/utils/renderPosts'

export const serverRenderPosts = createServerFn('GET', renderPosts)

export const Route = createFileRoute('/posts')({
  loader: async () => serverRenderPosts(),
  component: PostsComponent,
})

function PostsComponent() {
  return renderRsc(Route.useLoaderData())
}
