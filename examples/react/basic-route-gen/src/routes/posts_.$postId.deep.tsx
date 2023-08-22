import * as React from 'react'
import { FileRoute, Link } from '@tanstack/react-router'
import { fetchPost, PostErrorComponent } from './posts.$postId'

export type PostType = {
  id: string
  title: string
  body: string
}

// 'posts/$postId' is automatically inserted and managed
// by the `tsr generate/watch` CLI command
export const route = new FileRoute('/posts_/$postId/deep').createRoute({
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: PostErrorComponent as any,
  component: () => {
    const post = route.useLoader()

    return (
      <div className="p-2 space-y-2">
        <Link
          to="/posts"
          className="block py-1 text-blue-800 hover:text-blue-600"
        >
          ← All Posts
        </Link>
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    )
  },
})
