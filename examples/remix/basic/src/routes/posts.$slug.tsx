/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoute, useLoaderData } from '@tanstack/remix-router'
import { renderPostBody } from '../server/renderers'
import { Route as PostsRoute } from './posts'
import type { Handle } from '@remix-run/ui'

function PostDetail(handle: Handle) {
  const readPost = useLoaderData(handle, { from: '/posts/$slug' })
  return () => {
    const html = readPost()
    return html ? <div innerHTML={html} /> : <p>Post not found.</p>
  }
}

export const Route = createRoute({
  getParentRoute: () => PostsRoute,
  path: '$slug',
  loader: ({ params }: { params: { slug: string } }) =>
    renderPostBody({ data: params.slug }),
  component: PostDetail,
})
